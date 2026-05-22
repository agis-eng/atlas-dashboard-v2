// app/api/cron/listing-price-review/route.ts
//
// Weekly job: scrape Facebook's selling dashboard, apply the user's
// price-drop rules to active listings, and update the listings whose
// engagement says they need a new price.
//
// Triggered by Vercel Cron (vercel.json schedule) or manually via:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://<dashboard>/api/cron/listing-price-review
//
// Or hit it from a local script with the service-key header.

import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, type ListingDraft } from "@/lib/redis";
import { evaluatePriceDrop } from "@/lib/listing-price-rules";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface ScrapedFacebookListing {
  title: string;
  price: number | null;
  status: "active" | "sold" | "pending" | "unknown";
  listedDate: string | null;
  clicks: number;
  listingUrl: string | null;
}

async function getMacServerUrl(): Promise<string | null> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  const u = typeof raw === "string" ? raw : String(raw);
  return u.replace(/\/+$/, "");
}

async function scrapeFacebookListings(): Promise<ScrapedFacebookListing[]> {
  const macUrl = await getMacServerUrl();
  if (!macUrl) throw new Error("Mac server URL not in Redis (mercari:server:url)");
  const secret = process.env.MERCARI_SERVER_SECRET;
  const res = await fetch(`${macUrl}/facebook/scrape-listings`, {
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
  return data.listings || [];
}

async function updateFacebookPrice(listingUrl: string, newPrice: number) {
  const macUrl = await getMacServerUrl();
  if (!macUrl) throw new Error("Mac server URL not in Redis");
  const secret = process.env.MERCARI_SERVER_SECRET;
  const res = await fetch(`${macUrl}/facebook/update-price`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Mercari-Secret": secret } : {}),
    },
    body: JSON.stringify({ listingUrl, newPrice }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `update-price failed: HTTP ${res.status}`);
  }
  return data;
}

function normalizeTitle(t: string): string {
  return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchScanToDraft(
  draft: ListingDraft,
  scanned: ScrapedFacebookListing[]
): ScrapedFacebookListing | null {
  const draftKey = normalizeTitle(draft.title);
  if (!draftKey) return null;
  // Exact normalized match first
  const exact = scanned.find((s) => normalizeTitle(s.title) === draftKey);
  if (exact) return exact;
  // Prefix match (Facebook truncates long titles in the dashboard tile)
  const prefix = scanned.find((s) => {
    const sKey = normalizeTitle(s.title);
    return sKey && (draftKey.startsWith(sKey) || sKey.startsWith(draftKey));
  });
  return prefix || null;
}

async function authorize(request: NextRequest): Promise<boolean> {
  // Vercel cron uses Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  // Local script / manual run uses X-Service-Key matching BLOB_READ_WRITE_TOKEN
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

  // Only consider listings that are live on Facebook and not sold/errored.
  const eligible = all.filter((l) =>
    l.platforms?.includes("facebook") &&
    l.title &&
    l.price != null &&
    l.facebookListingUrl &&
    l.status !== "error"
  );

  let scanned: ScrapedFacebookListing[];
  try {
    scanned = await scrapeFacebookListings();
  } catch (err) {
    return Response.json(
      { error: "scrape failed", details: (err as Error).message },
      { status: 502 }
    );
  }

  const results: any[] = [];
  const now = new Date();
  let listings = all;

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
    if (match.status === "sold") {
      results.push({
        title: draft.title,
        action: "skip",
        reason: "marked as sold on Facebook",
      });
      // Persist the sold status in Redis
      const idx = listings.findIndex((l) => l.id === draft.id);
      if (idx >= 0) {
        listings[idx] = { ...listings[idx], status: "listed", facebookStatus: "listed" };
      }
      continue;
    }
    if (!draft.facebookListingUrl) {
      results.push({
        title: draft.title,
        action: "skip",
        reason: "no facebookListingUrl stored — can't update price without it",
      });
      continue;
    }

    const evalInput = {
      createdAt: draft.createdAt,
      currentPrice: draft.price as number,
      originalPrice: (draft as any).originalPrice ?? (draft.price as number),
      clicks: match.clicks,
      lastPriceChangeAt: (draft as any).lastPriceChangeAt,
    };
    const decision = evaluatePriceDrop(evalInput, now);

    if (!decision.shouldDrop) {
      results.push({
        title: draft.title,
        action: "no-drop",
        reason: decision.reason,
        ageDays: decision.ageDays,
        clicks: match.clicks,
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
        clicks: match.clicks,
      });
      continue;
    }

    try {
      await updateFacebookPrice(draft.facebookListingUrl, decision.newPrice!);
      const idx = listings.findIndex((l) => l.id === draft.id);
      if (idx >= 0) {
        listings[idx] = {
          ...listings[idx],
          price: decision.newPrice,
          updatedAt: now.toISOString(),
          ...({ lastPriceChangeAt: now.toISOString(), originalPrice: evalInput.originalPrice } as any),
        };
      }
      results.push({
        title: draft.title,
        action: "dropped",
        from: draft.price,
        to: decision.newPrice,
        reason: decision.reason,
        clicks: match.clicks,
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
    eligibleCount: eligible.length,
    scannedCount: scanned.length,
    results,
  });
}
