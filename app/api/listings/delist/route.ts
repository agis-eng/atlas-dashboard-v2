import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

export const maxDuration = 180;

// Remove/end a listing on every platform it's live on:
//   - eBay: end-listing (DELETE /sell/inventory/v1/offer/{offerId})
//   - Mercari / Facebook: Mac server clicks the platform-specific
//     delete/sold/remove action.

async function getMacServerUrl(redis: ReturnType<typeof getRedis>) {
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  const url = typeof raw === "string" ? raw : String(raw);
  return url.replace(/\/+$/, "");
}

async function callMac(
  base: string,
  path: string,
  body: any,
  secret: string | undefined
) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Mercari-Secret": secret } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.substring(0, 500) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function callEbayEnd(listing: ListingDraft, request: NextRequest) {
  if (!listing.ebayOfferId) {
    return { ok: false, platform: "ebay", skipped: true, reason: "no ebayOfferId stored" };
  }
  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/ebay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({ action: "end-listing", offerId: listing.ebayOfferId }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, platform: "ebay", status: res.status, data };
  } catch (err: any) {
    return { ok: false, platform: "ebay", error: String(err?.message || err) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { listingId } = await request.json();
    if (!listingId) {
      return Response.json({ error: "listingId required" }, { status: 400 });
    }

    const redis = getRedis();
    const listingsRaw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = listingsRaw
      ? typeof listingsRaw === "string"
        ? JSON.parse(listingsRaw)
        : (listingsRaw as ListingDraft[])
      : [];
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });

    const serverUrl = await getMacServerUrl(redis);
    const secret = process.env.MERCARI_SERVER_SECRET;

    const results: any[] = [];

    if (listing.ebayListingId) {
      results.push(await callEbayEnd(listing, request));
    }
    if (listing.mercariListingUrl) {
      if (!serverUrl) {
        results.push({ ok: false, platform: "mercari", error: "Mac server not reachable" });
      } else {
        const r = await callMac(
          serverUrl,
          "/mercari/delist",
          { listingUrl: listing.mercariListingUrl },
          secret
        );
        results.push({ ok: r.ok, platform: "mercari", status: r.status, data: r.data });
      }
    }
    if (listing.facebookListingUrl) {
      if (!serverUrl) {
        results.push({ ok: false, platform: "facebook", error: "Mac server not reachable" });
      } else {
        const r = await callMac(
          serverUrl,
          "/facebook/delist",
          { listingUrl: listing.facebookListingUrl },
          secret
        );
        results.push({ ok: r.ok, platform: "facebook", status: r.status, data: r.data });
      }
    }

    // Update local status to reflect sold/delisted
    const updatedListings = listings.map((l) =>
      l.id === listingId
        ? { ...l, status: "draft" as const, updatedAt: new Date().toISOString() }
        : l
    );
    await redis.set(REDIS_KEYS.listings, JSON.stringify(updatedListings));

    const anySuccess = results.some((r) => r.ok);
    return Response.json({ success: anySuccess, results });
  } catch (error: any) {
    console.error("delist error:", error);
    return Response.json(
      { error: "Failed to delist", details: error.message },
      { status: 500 }
    );
  }
}
