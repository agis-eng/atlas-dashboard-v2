import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";
import { getEbayPriceSuggestion } from "@/lib/ebay-price";

export const maxDuration = 30;

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

    const result = await getEbayPriceSuggestion(listing.title);

    if (result.suggestedPrice !== null) {
      const updated = listings.map(l =>
        l.id === listingId ? { ...l, price: result.suggestedPrice, updatedAt: new Date().toISOString() } : l
      );
      await redis.set(REDIS_KEYS.listings, JSON.stringify(updated));
    }

    return Response.json(result);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
