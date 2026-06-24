// app/api/cron/ebay-price-review/route.ts
//
// Weekly job: pull the eBay Analytics traffic report (per-listing views),
// apply the user's price-drop rules to active eBay listings, and lower the
// price on the ones whose age + views say they're priced too high.
//
// eBay GTC ("Good 'Til Cancelled") listings auto-renew monthly, so there's
// no renewal branch — just evaluate -> drop via the Inventory update-offer
// API (offerId stored at publish time).
//
// Triggered by Vercel Cron (vercel.json) or manually via:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://<dashboard>/api/cron/ebay-price-review
//   (or X-Service-Key: <BLOB_READ_WRITE_TOKEN> for a local run, ?dryRun=1)

import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, type ListingDraft } from "@/lib/redis";
import { evaluatePriceDrop } from "@/lib/listing-price-rules";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Per-listing tracking so price-change cool-offs survive across runs even
// when originalPrice / lastPriceChangeAt aren't yet on the Redis draft.
interface EbayTrackingRecord {
  firstSeenAt: string;
  originalPrice: number;
  lastSeenAt: string;
  currentPrice: number;
  lastPriceChangeAt?: string;
}

async function ebayGetTraffic(origin: string, cookie: string, serviceKey: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  if (serviceKey) headers["X-Service-Key"] = serviceKey;
  const res = await fetch(`${origin}/api/ebay`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "get-traffic", days: 30 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `get-traffic failed: HTTP ${res.status}`);
  return (data.views || {}) as Record<string, number>;
}

async function ebayUpdateOffer(origin: string, cookie: string, serviceKey: string, offerId: string, newPrice: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  if (serviceKey) headers["X-Service-Key"] = serviceKey;
  const res = await fetch(`${origin}/api/ebay`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "update-offer",
      offerId,
      pricingSummary: { price: { value: String(newPrice), currency: "USD" } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `update-offer failed: HTTP ${res.status}`);
  }
  return data;
}

function slugifyTitle(t: string): string {
  return (t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unknown";
}

async function authorize(request: NextRequest): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const svcKey = request.headers.get("x-service-key");
  if (svcKey && process.env.BLOB_READ_WRITE_TOKEN && svcKey === process.env.BLOB_READ_WRITE_TOKEN) {
    return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!(await authorize(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get("cookie") || "";
  const serviceKey = request.headers.get("x-service-key") || "";

  const redis = getRedis();
  const listingsRaw = (await redis.get(REDIS_KEYS.listings)) as ListingDraft[] | null;
  const all = listingsRaw || [];

  const eligible = all.filter(
    (l) =>
      l.platforms?.includes("ebay") &&
      l.title &&
      l.price != null &&
      l.ebayOfferId &&
      l.status !== "error" &&
      l.status !== "sold"
  );

  // Traffic (views by eBay listingId). If Analytics is unavailable we treat
  // every listing as 0 views — the rules still drop on age, just more eagerly.
  let viewsById: Record<string, number> = {};
  let trafficError: string | null = null;
  try {
    viewsById = await ebayGetTraffic(origin, cookie, serviceKey);
  } catch (err) {
    trafficError = (err as Error).message;
  }

  const now = new Date();
  let listings = all;
  const results: any[] = [];

  for (const draft of eligible) {
    const slug = slugifyTitle(draft.title);
    const key = REDIS_KEYS.ebayTracking(slug);
    const tracking = (await redis.get(key)) as EbayTrackingRecord | null;

    const views = draft.ebayListingId ? (viewsById[String(draft.ebayListingId)] ?? 0) : 0;
    const originalPrice =
      tracking?.originalPrice ?? (draft as any).originalPrice ?? (draft.price as number);
    const lastPriceChangeAt = tracking?.lastPriceChangeAt ?? (draft as any).lastPriceChangeAt;

    const decision = evaluatePriceDrop(
      {
        createdAt: draft.createdAt,
        currentPrice: draft.price as number,
        originalPrice,
        clicks: views,
        lastPriceChangeAt,
      },
      now
    );

    const baseRecord: EbayTrackingRecord = tracking
      ? { ...tracking, lastSeenAt: now.toISOString(), currentPrice: draft.price as number }
      : {
          firstSeenAt: now.toISOString(),
          originalPrice,
          lastSeenAt: now.toISOString(),
          currentPrice: draft.price as number,
        };
    if (!dryRun) await redis.set(key, baseRecord);

    if (!decision.shouldDrop) {
      results.push({
        title: draft.title,
        action: "no-drop",
        reason: decision.reason,
        ageDays: decision.ageDays,
        views,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        title: draft.title,
        action: "would-drop",
        from: draft.price,
        to: decision.newPrice,
        reason: decision.reason,
        ageDays: decision.ageDays,
        views,
      });
      continue;
    }

    try {
      await ebayUpdateOffer(origin, cookie, serviceKey, draft.ebayOfferId!, decision.newPrice!);
      const idx = listings.findIndex((l) => l.id === draft.id);
      if (idx >= 0) {
        listings[idx] = {
          ...listings[idx],
          price: decision.newPrice,
          updatedAt: now.toISOString(),
          ...({ originalPrice, lastPriceChangeAt: now.toISOString() } as any),
        };
      }
      await redis.set(key, {
        ...baseRecord,
        currentPrice: decision.newPrice!,
        lastPriceChangeAt: now.toISOString(),
      });
      results.push({
        title: draft.title,
        action: "dropped",
        from: draft.price,
        to: decision.newPrice,
        reason: decision.reason,
        views,
      });
    } catch (err) {
      results.push({
        title: draft.title,
        action: "drop-failed",
        from: draft.price,
        to: decision.newPrice,
        error: (err as Error).message,
      });
    }
  }

  if (!dryRun) {
    await redis.set(REDIS_KEYS.listings, listings);
  }

  return Response.json({
    ran: now.toISOString(),
    dryRun,
    platform: "ebay",
    eligibleCount: eligible.length,
    trafficError,
    trafficListingCount: Object.keys(viewsById).length,
    results,
  });
}
