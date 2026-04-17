import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

export const maxDuration = 180;

// Bulk-change price across every platform the listing is live on:
//   - eBay: update-offer via the eBay API (needs ebayOfferId stored at publish)
//   - Mercari / Facebook: Mac marketplace-server drives the edit via Playwright

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

async function callEbayUpdate(
  listing: ListingDraft,
  newPrice: number,
  request: NextRequest
) {
  if (!listing.ebayOfferId) {
    return { ok: false, platform: "ebay", skipped: true, reason: "no ebayOfferId stored (was this published before V1 tracking?)" };
  }
  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/ebay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        action: "update-offer",
        offerId: listing.ebayOfferId,
        pricingSummary: {
          price: { value: String(newPrice), currency: "USD" },
        },
      }),
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

    const { listingId, newPrice } = await request.json();
    if (!listingId || newPrice == null) {
      return Response.json(
        { error: "listingId and newPrice required" },
        { status: 400 }
      );
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

    // eBay
    if (listing.ebayListingId) {
      results.push(await callEbayUpdate(listing, Number(newPrice), request));
    }
    // Mercari
    if (listing.mercariListingUrl) {
      if (!serverUrl) {
        results.push({ ok: false, platform: "mercari", error: "Mac server not reachable" });
      } else {
        const r = await callMac(
          serverUrl,
          "/mercari/update-price",
          { listingUrl: listing.mercariListingUrl, newPrice },
          secret
        );
        results.push({ ok: r.ok, platform: "mercari", status: r.status, data: r.data });
      }
    }
    // Facebook
    if (listing.facebookListingUrl) {
      if (!serverUrl) {
        results.push({ ok: false, platform: "facebook", error: "Mac server not reachable" });
      } else {
        const r = await callMac(
          serverUrl,
          "/facebook/update-price",
          { listingUrl: listing.facebookListingUrl, newPrice },
          secret
        );
        results.push({ ok: r.ok, platform: "facebook", status: r.status, data: r.data });
      }
    }

    // Update the listing draft's price locally regardless, so the dashboard
    // reflects the new asking price.
    const updatedListings = listings.map((l) =>
      l.id === listingId
        ? { ...l, price: Number(newPrice), updatedAt: new Date().toISOString() }
        : l
    );
    await redis.set(REDIS_KEYS.listings, JSON.stringify(updatedListings));

    const anySuccess = results.some((r) => r.ok);
    return Response.json({
      success: anySuccess,
      newPrice: Number(newPrice),
      results,
    });
  } catch (error: any) {
    console.error("update-price error:", error);
    return Response.json(
      { error: "Failed to update price", details: error.message },
      { status: 500 }
    );
  }
}
