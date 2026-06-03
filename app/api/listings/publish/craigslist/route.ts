import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

export const maxDuration = 300;

async function getMacServerUrl(redis: ReturnType<typeof getRedis>) {
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  return (typeof raw === "string" ? raw : String(raw)).replace(/\/+$/, "");
}

async function callMacServer(base: string, path: string, body: any, secret: string | undefined) {
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
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.substring(0, 500) }; }
  return { ok: res.ok, status: res.status, data };
}

async function updateListingField(
  redis: ReturnType<typeof getRedis>,
  listings: ListingDraft[],
  listingId: string,
  updates: Partial<ListingDraft>
) {
  const updated = listings.map(l =>
    l.id === listingId ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
  );
  await redis.set(REDIS_KEYS.listings, JSON.stringify(updated));
}

export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { listingId, sessionId: existingSessionId, step } = await request.json();
    if (!listingId || !step) {
      return Response.json({ error: "listingId and step are required" }, { status: 400 });
    }

    const redis = getRedis();
    const listingsRaw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = listingsRaw
      ? typeof listingsRaw === "string" ? JSON.parse(listingsRaw) : (listingsRaw as ListingDraft[])
      : [];
    const listing = listings.find(l => l.id === listingId);
    if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });
    if (!listing.title || !listing.price) {
      return Response.json({ error: "Title and price are required" }, { status: 400 });
    }

    const serverUrl = await getMacServerUrl(redis);
    if (!serverUrl) {
      return Response.json({ error: "Mac marketplace-server is not reachable." }, { status: 503 });
    }

    const secret = process.env.MERCARI_SERVER_SECRET;

    switch (step) {
      case "start": {
        const { ok, status, data } = await callMacServer(serverUrl, "/craigslist/start", {}, secret);
        if (!ok) return Response.json({ error: data?.error || "Mac server start failed" }, { status });
        await updateListingField(redis, listings, listingId, { craigslistStatus: "publishing" } as any);
        return Response.json({ success: true, sessionId: data.sessionId, step: "start", next: "fill" });
      }

      case "fill": {
        if (!existingSessionId) return Response.json({ error: "sessionId required" }, { status: 400 });
        const { ok, status, data } = await callMacServer(serverUrl, "/craigslist/fill", { sessionId: existingSessionId, listing }, secret);
        if (!ok) {
          await updateListingField(redis, listings, listingId, { craigslistStatus: "error", craigslistError: String(data?.error || "").substring(0, 300) } as any);
          return Response.json({ error: "Fill failed", details: String(data?.error || "") }, { status: status || 500 });
        }
        return Response.json({ success: true, status: "pending", jobId: data.jobId || existingSessionId, sessionId: existingSessionId, step: "fill", next: "fill-status" });
      }

      case "fill-status": {
        if (!existingSessionId) return Response.json({ error: "sessionId required" }, { status: 400 });
        const { ok, status, data } = await callMacServer(serverUrl, "/craigslist/fill-status", { jobId: existingSessionId }, secret);
        if (!ok) return Response.json({ error: "Fill status check failed" }, { status: status || 500 });
        if (data.status === "pending") return Response.json({ success: true, status: "pending", sessionId: existingSessionId });
        if (data.status === "error") {
          await updateListingField(redis, listings, listingId, { craigslistStatus: "error", craigslistError: String(data.error || "").substring(0, 300) } as any);
          return Response.json({ error: "Fill failed", details: data.error }, { status: 500 });
        }
        return Response.json({ success: true, status: "done", sessionId: existingSessionId, step: "fill-status", next: "submit" });
      }

      case "submit": {
        if (!existingSessionId) return Response.json({ error: "sessionId required" }, { status: 400 });
        const { ok, status, data } = await callMacServer(serverUrl, "/craigslist/submit", { sessionId: existingSessionId }, secret);
        if (!ok) {
          await updateListingField(redis, listings, listingId, { craigslistStatus: "error", craigslistError: String(data?.error || "").substring(0, 300) } as any);
          return Response.json({ error: "Submit failed", details: String(data?.error || "") }, { status: status || 500 });
        }
        if (!data.success) {
          await updateListingField(redis, listings, listingId, { craigslistStatus: "error", craigslistError: `Submit may have failed. URL: ${data.finalUrl}` } as any);
          return Response.json({ success: false, error: "Submit may have failed", details: data.finalUrl });
        }
        await updateListingField(redis, listings, listingId, {
          craigslistStatus: "listed",
          craigslistListingUrl: data.finalUrl,
          status: "listed",
        } as any);
        return Response.json({ success: true, listingUrl: data.finalUrl, step: "submit" });
      }

      default:
        return Response.json({ error: "Invalid step" }, { status: 400 });
    }
  } catch (error: any) {
    return Response.json({ error: "Failed to publish to Craigslist", details: error.message }, { status: 500 });
  }
}
