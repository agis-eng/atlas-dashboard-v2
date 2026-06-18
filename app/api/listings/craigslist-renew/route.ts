import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

export const maxDuration = 300;

async function getMacServerUrl(redis: ReturnType<typeof getRedis>) {
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  return (typeof raw === "string" ? raw : String(raw)).replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const redis = getRedis();
    const serverUrl = await getMacServerUrl(redis);
    if (!serverUrl) {
      return Response.json({ error: "Mac server URL not in Redis — tunnel may be down" }, { status: 503 });
    }

    const secret = process.env.MERCARI_SERVER_SECRET;
    const res = await fetch(`${serverUrl}/craigslist/renew-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Mercari-Secret": secret } : {}),
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(280_000),
    });

    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.substring(0, 500) }; }

    if (!res.ok) {
      return Response.json({ error: data?.error || "Mac server renew-all failed" }, { status: res.status });
    }

    // Stamp lastRenewedAt on all CL-listed listings
    if (data.ok && data.renewed > 0) {
      const listingsRaw = await redis.get(REDIS_KEYS.listings);
      const listings: ListingDraft[] = listingsRaw
        ? typeof listingsRaw === "string" ? JSON.parse(listingsRaw) : (listingsRaw as ListingDraft[])
        : [];
      const now = new Date().toISOString();
      const updated = listings.map((l: any) =>
        (l.craigslistStatus === "listed" && l.craigslistListingUrl)
          ? { ...l, craigslistLastRenewed: now }
          : l
      );
      await redis.set(REDIS_KEYS.listings, JSON.stringify(updated));
    }

    return Response.json(data);
  } catch (err: any) {
    return Response.json({ error: "Renew failed", details: err.message }, { status: 500 });
  }
}
