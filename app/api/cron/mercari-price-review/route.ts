// app/api/cron/mercari-price-review/route.ts
//
// Weekly job: scrape the Mercari selling dashboard, apply the user's
// price-drop rules to active Mercari listings, and lower the price on the
// ones whose age + engagement say they're priced too high.
//
// Mercari has no "renew" concept (listings don't expire), but lowering the
// price auto-notifies everyone who liked the item — so a price drop IS the
// re-engagement mechanism here. That's why this cron is simpler than the
// Facebook one: scrape -> evaluate -> drop, no renewal branch.
//
// Triggered by Vercel Cron (vercel.json) or manually via:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://<dashboard>/api/cron/mercari-price-review
//   (or X-Service-Key: <BLOB_READ_WRITE_TOKEN> for a local run, ?dryRun=1)

import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, type ListingDraft } from "@/lib/redis";
import { evaluatePriceDrop } from "@/lib/listing-price-rules";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ScrapedMercariListing {
  url: string;
  title: string;
  price: number | null;
  daysListed: number | null;
  likes: number | null;
  views: number | null;
}

// Per-listing tracking so price-change cool-offs survive across runs even
// when originalPrice / lastPriceChangeAt aren't yet on the Redis draft.
interface MercariTrackingRecord {
  firstSeenAt: string;
  originalPrice: number;
  lastSeenAt: string;
  currentPrice: number;
  lastPriceChangeAt?: string;
}

async function getMacServerUrl(): Promise<string | null> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  const u = typeof raw === "string" ? raw : String(raw);
  return u.replace(/\/+$/, "");
}

async function scrapeMercariListings(): Promise<ScrapedMercariListing[]> {
  const macUrl = await getMacServerUrl();
  if (!macUrl) throw new Error("Mac server URL not in Redis (mercari:server:url)");
  const secret = process.env.MERCARI_SERVER_SECRET;
  const res = await fetch(`${macUrl}/mercari/scrape-listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Mercari-Secret": secret } : {}),
    },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mac server scrape failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.items || []) as ScrapedMercariListing[];
}

async function updateMercariPrice(listingUrl: string, newPrice: number) {
  const macUrl = await getMacServerUrl();
  if (!macUrl) throw new Error("Mac server URL not in Redis");
  const secret = process.env.MERCARI_SERVER_SECRET;
  const res = await fetch(`${macUrl}/mercari/update-price`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Mercari-Secret": secret } : {}),
    },
    body: JSON.stringify({ listingUrl, newPrice }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `mercari update-price failed: HTTP ${res.status}`);
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

function normalizeTitle(t: string): string {
  return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchScanToDraft(
  draft: ListingDraft,
  scanned: ScrapedMercariListing[]
): ScrapedMercariListing | null {
  // Prefer an exact URL match when we stored the Mercari listing URL.
  if (draft.mercariListingUrl) {
    const byUrl = scanned.find(
      (s) => s.url && draft.mercariListingUrl!.includes(s.url.replace(/^https?:\/\/[^/]+/, ""))
    );
    if (byUrl) return byUrl;
  }
  const draftKey = normalizeTitle(draft.title);
  if (!draftKey) return null;
  const exact = scanned.find((s) => normalizeTitle(s.title) === draftKey);
  if (exact) return exact;
  const prefix = scanned.find((s) => {
    const sKey = normalizeTitle(s.title);
    return sKey && (draftKey.startsWith(sKey) || sKey.startsWith(draftKey));
  });
  return prefix || null;
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

  const redis = getRedis();
  const listingsRaw = (await redis.get(REDIS_KEYS.listings)) as ListingDraft[] | null;
  const all = listingsRaw || [];

  const eligible = all.filter(
    (l) =>
      l.platforms?.includes("mercari") &&
      l.title &&
      l.price != null &&
      l.mercariListingUrl &&
      l.status !== "error" &&
      l.status !== "sold"
  );

  let scanned: ScrapedMercariListing[];
  try {
    scanned = await scrapeMercariListings();
  } catch (err) {
    return Response.json(
      { error: "scrape failed", details: (err as Error).message },
      { status: 502 }
    );
  }

  const now = new Date();
  let listings = all;
  const results: any[] = [];

  for (const draft of eligible) {
    const match = matchScanToDraft(draft, scanned);
    if (!match) {
      results.push({
        title: draft.title,
        action: "skip",
        reason: "no scan match (sold or de-listed?)",
      });
      continue;
    }

    const slug = slugifyTitle(draft.title);
    const key = REDIS_KEYS.mercariTracking(slug);
    const tracking = (await redis.get(key)) as MercariTrackingRecord | null;

    // Mercari's own "listed N days ago" is the truest age; fall back to our
    // createdAt if the scrape couldn't parse it.
    const createdAt =
      match.daysListed != null
        ? new Date(now.getTime() - match.daysListed * MS_PER_DAY).toISOString()
        : draft.createdAt;

    // Engagement signal: prefer views, fall back to likes, else 0. Mercari
    // shows fewer of these than Facebook, so 0 is common and (per the rules)
    // pushes toward a larger drop — which is the intent when nobody's looking.
    const engagement = match.views ?? match.likes ?? 0;
    const originalPrice =
      tracking?.originalPrice ?? (draft as any).originalPrice ?? (draft.price as number);
    const lastPriceChangeAt = tracking?.lastPriceChangeAt ?? (draft as any).lastPriceChangeAt;

    const decision = evaluatePriceDrop(
      {
        createdAt,
        currentPrice: draft.price as number,
        originalPrice,
        clicks: engagement,
        lastPriceChangeAt,
      },
      now
    );

    // Refresh the tracking record's "last seen" snapshot every run.
    const baseRecord: MercariTrackingRecord = tracking
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
        engagement,
        engagementKind: match.views != null ? "views" : match.likes != null ? "likes" : "none",
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
        engagement,
      });
      continue;
    }

    try {
      await updateMercariPrice(draft.mercariListingUrl!, decision.newPrice!);
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
        engagement,
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
    platform: "mercari",
    eligibleCount: eligible.length,
    scannedCount: scanned.length,
    results,
  });
}
