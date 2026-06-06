import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import type { ListingDraft } from "@/lib/redis";

// Whether a single platform is "done" for a listing. Each marketplace records
// success differently, so we check the real signal per platform:
//   - eBay      → ebayStatus "listed" OR a real ebayListingId
//   - Mercari   → mercariStatus "listed" OR "draft" (a ready-to-list draft
//                 counts as done; the seller taps List in Mercari to finish)
//   - Facebook  → facebookStatus "listed" OR a facebookListingUrl
//   - Craigslist→ craigslistStatus "listed" OR a craigslistListingUrl
function platformDone(l: ListingDraft, p: string): boolean {
  const rec = l as unknown as Record<string, unknown>;
  switch (p) {
    case "ebay":
      return rec.ebayStatus === "listed" || !!rec.ebayListingId;
    case "mercari":
      return rec.mercariStatus === "listed" || rec.mercariStatus === "draft";
    case "facebook":
      return rec.facebookStatus === "listed" || !!rec.facebookListingUrl;
    case "craigslist":
      return rec.craigslistStatus === "listed" || !!rec.craigslistListingUrl;
    default:
      return rec[`${p}Status`] === "listed";
  }
}

// The per-platform signals are the source of truth for whether an item went
// live. If every platform the seller selected is done, the item is listed —
// even if a stale UI save wrote the top-level status back to "ready"/"draft"
// after the publish completed. This only promotes to "listed"; never downgrades.
function reconcileListedStatus(l: ListingDraft): ListingDraft {
  const platforms = Array.isArray(l.platforms) ? l.platforms : [];
  if (platforms.length === 0) return l;
  const allDone = platforms.every((p) => platformDone(l, p));
  if (allDone && l.status !== "listed") {
    return { ...l, status: "listed" };
  }
  return l;
}

// GET — fetch all listing drafts
export async function GET(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const stored = ((await redis.get(REDIS_KEYS.listings)) as ListingDraft[] | null) || [];
    const listings = stored.map(reconcileListedStatus);
    // Persist once if any stored record drifted, so server-side consumers
    // (cron, pricing) see the corrected status too.
    if (listings.some((l, i) => l.status !== stored[i].status)) {
      await redis.set(REDIS_KEYS.listings, listings);
    }

    return Response.json({ listings });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST — create or update a listing draft
export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
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
        // Remove null fields (used to clear errors)
        for (const key of Object.keys(listings[idx])) {
          if ((listings[idx] as any)[key] === null) {
            delete (listings[idx] as any)[key];
          }
        }
        // A stale UI save can carry status:"ready" back over a completed
        // publish — re-derive "listed" from the platform statuses.
        listings[idx] = reconcileListedStatus(listings[idx]);
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
        quantity: body.quantity || 1,
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
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
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
