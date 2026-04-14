import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

// Nextdoor has no listing creation API.
// This route formats the listing for easy copy-paste into Nextdoor's "For Sale & Free" section.

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId } = await request.json();

    if (!listingId) {
      return Response.json({ error: "listingId is required" }, { status: 400 });
    }

    const redis = getRedis();
    const listingsRaw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = listingsRaw
      ? (typeof listingsRaw === "string" ? JSON.parse(listingsRaw) : listingsRaw)
      : [];
    const listing = listings.find((l) => l.id === listingId);

    if (!listing) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    // Format for Nextdoor "For Sale & Free" post
    const formattedPost = [
      listing.title,
      "",
      `Price: $${listing.price?.toFixed(2) || "Make an offer"}`,
      `Condition: ${listing.condition || "See description"}`,
      "",
      listing.description,
      "",
      "📍 Local pickup available",
    ].join("\n");

    return Response.json({
      connected: false,
      message: "Nextdoor doesn't have a listing API. Copy the text below and post it to Nextdoor's For Sale & Free section.",
      postUrl: "https://nextdoor.com/for_sale_and_free/",
      formattedPost,
      listing: {
        title: listing.title,
        description: listing.description,
        price: listing.price,
        photos: listing.photos,
        condition: listing.condition,
      },
    });
  } catch (error: any) {
    return Response.json(
      { error: "Failed to format for Nextdoor", details: error.message },
      { status: 500 }
    );
  }
}
