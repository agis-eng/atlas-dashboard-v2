import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

export const maxDuration = 30;

const EBAY_APP_ID = "AndreaLa-openclaw-PRD-3f61be8bd-dbf814a3";

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Strip platform-specific noise from titles to get cleaner search terms
function cleanTitle(title: string): string {
  return title
    .replace(/\b(new with tags?|nwt|new in box|nib|new in package|nip)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { listingId } = await request.json();
    if (!listingId) return Response.json({ error: "listingId required" }, { status: 400 });

    const redis = getRedis();
    const raw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = raw
      ? typeof raw === "string" ? JSON.parse(raw) : (raw as ListingDraft[])
      : [];
    const listing = listings.find(l => l.id === listingId);
    if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });

    const keywords = cleanTitle(listing.title);
    if (!keywords) return Response.json({ error: "No title to search" }, { status: 400 });

    const params = new URLSearchParams({
      "OPERATION-NAME": "findCompletedItems",
      "SERVICE-VERSION": "1.0.0",
      "SECURITY-APPNAME": EBAY_APP_ID,
      "RESPONSE-DATA-FORMAT": "JSON",
      "keywords": keywords,
      "itemFilter(0).name": "SoldItemsOnly",
      "itemFilter(0).value": "true",
      "sortOrder": "EndTimeSoonest",
      "paginationInput.entriesPerPage": "25",
    });

    const res = await fetch(
      `https://svcs.ebay.com/services/search/FindingService/v1?${params}`,
      { headers: { "Content-Type": "application/json" } }
    );

    if (!res.ok) {
      return Response.json({ error: `eBay API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const items =
      data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];

    const prices: number[] = items
      .map((item: any) => {
        const raw = item?.sellingStatus?.[0]?.currentPrice?.[0]?.["__value__"];
        return raw ? parseFloat(raw) : null;
      })
      .filter((p: number | null): p is number => p !== null && p > 0);

    if (prices.length === 0) {
      return Response.json({
        suggestedPrice: null,
        medianSoldPrice: null,
        sampleSize: 0,
        message: "No sold listings found — try adjusting the title",
      });
    }

    const med = median(prices);
    const suggested = Math.round(med * 0.85);

    return Response.json({
      suggestedPrice: suggested,
      medianSoldPrice: Math.round(med * 100) / 100,
      sampleSize: prices.length,
      priceRange: { low: Math.min(...prices), high: Math.max(...prices) },
      message: `Based on ${prices.length} recent eBay sales. Median $${med.toFixed(2)} → suggested $${suggested} (15% under).`,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
