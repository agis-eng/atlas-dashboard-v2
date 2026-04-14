import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

// TikTok Shop API integration
// API docs: https://partner.tiktokshop.com/docv2/page/seller-api-overview
// Requires: App Key, App Secret, and Shop Access Token from TikTok Seller Center

const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com";

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId, action } = await request.json();

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

    const accessToken = process.env.TIKTOK_SHOP_ACCESS_TOKEN;
    const appKey = process.env.TIKTOK_SHOP_APP_KEY;

    if (!accessToken || !appKey) {
      // Not connected yet — return formatted listing data for manual posting
      return Response.json({
        connected: false,
        message: "TikTok Shop not connected yet. Use the listing details below to post manually.",
        listing: {
          title: listing.title,
          description: listing.description,
          price: listing.price,
          photos: listing.photos,
          condition: listing.condition,
          category: listing.category,
        },
      });
    }

    // TODO: Implement TikTok Shop API integration when credentials are configured
    // POST /api/products/products - Create product
    // POST /api/products/upload_imgs - Upload images
    // See: https://partner.tiktokshop.com/docv2/page/seller-api-overview

    return Response.json({
      connected: true,
      message: "TikTok Shop API integration coming soon. Use manual posting for now.",
      listing: {
        title: listing.title,
        description: listing.description,
        price: listing.price,
        photos: listing.photos,
      },
    });
  } catch (error: any) {
    return Response.json(
      { error: "Failed to publish to TikTok Shop", details: error.message },
      { status: 500 }
    );
  }
}
