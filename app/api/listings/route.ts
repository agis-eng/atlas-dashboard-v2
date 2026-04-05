import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import type { ListingDraft } from "@/lib/redis";

// GET — fetch all listing drafts
export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const listings = (await redis.get(REDIS_KEYS.listings)) as ListingDraft[] | null;

    return Response.json({ listings: listings || [] });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST — create or update a listing draft
export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const redis = getRedis();
    const existing = (await redis.get(REDIS_KEYS.listings)) as ListingDraft[] | null;
    const listings = existing || [];

    if (body.id) {
      // Update existing
      const idx = listings.findIndex((l) => l.id === body.id);
      if (idx >= 0) {
        listings[idx] = { ...listings[idx], ...body, updatedAt: new Date().toISOString() };
      } else {
        return Response.json({ error: "Listing not found" }, { status: 404 });
      }
    } else {
      // Create new
      const newListing: ListingDraft = {
        id: body.listingId || crypto.randomUUID(),
        photos: body.photos || [],
        title: body.title || "",
        description: body.description || "",
        price: body.price ?? null,
        condition: body.condition || "",
        category: body.category || "",
        platforms: body.platforms || [],
        status: body.status || "draft",
        aiAnalysis: body.aiAnalysis || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      listings.unshift(newListing);
    }

    await redis.set(REDIS_KEYS.listings, listings);

    return Response.json({ success: true, listings });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a listing draft
export async function DELETE(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

    const redis = getRedis();
    const existing = (await redis.get(REDIS_KEYS.listings)) as ListingDraft[] | null;
    const listings = (existing || []).filter((l) => l.id !== id);
    await redis.set(REDIS_KEYS.listings, listings);

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
