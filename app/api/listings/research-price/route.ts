import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";
import { resolveListingPrice } from "@/lib/ebay-price";

export const maxDuration = 45;

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

    // Shared resolver: eBay sold comps → AI web-search resale → eBay active →
    // retail×0.7, with wrong-comp (>2x retail) detection. Same logic the batch
    // ingest uses, so the first-pass price already matches the research result.
    const { price: chosenPrice, source: priceSource, ebay, ai, ebayMismatch } =
      await resolveListingPrice(listing.title);
    const ebayPrice = ebay.suggestedPrice;
    const retail = ai?.avgRetailPrice ?? null;
    const resale = ai?.avgResalePrice ?? null;

    if (chosenPrice !== null) {
      const updated = listings.map(l =>
        l.id === listingId ? { ...l, price: chosenPrice, updatedAt: new Date().toISOString() } : l
      );
      await redis.set(REDIS_KEYS.listings, JSON.stringify(updated));
    }

    return Response.json({
      ...ebay,
      ai,
      chosenPrice,
      priceSource,
      ebayMismatch,
      // Keep suggestedPrice reflecting what we actually chose so the UI shows it.
      suggestedPrice: chosenPrice,
      ebayRawSuggestedPrice: ebayPrice,
      message: ebayMismatch
        ? `eBay suggested $${ebayPrice} but that's >2x the ~$${retail} retail — likely a wrong-product match, so used the resale estimate $${chosenPrice} instead.`
        : ebay.message,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
