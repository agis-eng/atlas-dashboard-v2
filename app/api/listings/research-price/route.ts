import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";
import { getEbayPriceSuggestion, getAiPriceEstimate } from "@/lib/ebay-price";

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

    const [ebay, ai] = await Promise.all([
      getEbayPriceSuggestion(listing.title),
      getAiPriceEstimate(listing.title),
    ]);

    const ebayPrice = ebay.suggestedPrice;
    const retail = ai?.avgRetailPrice ?? null;
    const resale = ai?.avgResalePrice ?? null;

    // eBay matches by title keywords and frequently grabs the WRONG product
    // (a bundle, multi-pack, or different SKU) — which shows up as a price far
    // above the item's real retail. When eBay > 2x the AI retail estimate,
    // treat it as a mismatch and fall back to the AI resale estimate instead of
    // pricing the item off a wrong comp.
    const ebayMismatch =
      ebayPrice !== null && retail !== null && retail > 0 && ebayPrice > retail * 2;

    let chosenPrice: number | null = null;
    let priceSource = "";
    if (ebayPrice !== null && !ebayMismatch) {
      chosenPrice = ebayPrice;
      priceSource = "ebay-comps";
    } else if (resale !== null && resale > 0) {
      chosenPrice = Math.round(resale);
      priceSource = ebayMismatch ? "ai-resale (eBay flagged as mismatch)" : "ai-resale";
    } else if (retail !== null && retail > 0) {
      chosenPrice = Math.round(retail * 0.7);
      priceSource = "ai-retail-x0.7";
    }

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
