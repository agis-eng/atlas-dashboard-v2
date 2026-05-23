import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

export const maxDuration = 30;

function cleanTitle(title: string): string {
  return title
    .replace(/\b(new with tags?|nwt|new in box|nib|new in package|nip)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function getEbayAppToken(): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set");
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get eBay token");
  return data.access_token;
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

    const token = await getEbayAppToken();

    const params = new URLSearchParams({
      q: keywords,
      limit: "25",
      filter: "buyingOptions:{FIXED_PRICE}",
    });

    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `eBay API error: ${res.status}`, details: err.slice(0, 200) }, { status: 502 });
    }

    const data = await res.json();
    const prices: number[] = (data.itemSummaries || [])
      .map((item: any) => parseFloat(item?.price?.value))
      .filter((p: number) => !isNaN(p) && p > 0);

    if (prices.length === 0) {
      return Response.json({
        suggestedPrice: null,
        sampleSize: 0,
        message: "No active listings found on eBay — try adjusting the title",
      });
    }

    const med = median(prices);
    // Active listing prices (not sold) — suggest 10% under median to be competitive
    const suggested = Math.round(med * 0.90);

    return Response.json({
      suggestedPrice: suggested,
      medianListPrice: Math.round(med * 100) / 100,
      sampleSize: prices.length,
      priceRange: { low: Math.min(...prices), high: Math.max(...prices) },
      message: `Based on ${prices.length} active eBay listings. Median $${med.toFixed(2)} → suggested $${suggested} (10% under).`,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
