import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";
import crypto from "crypto";

export const maxDuration = 180;

// Pulls the user's active Mercari listings via the Mac server and merges
// them into the dashboard's Redis state. Dedupes by mercariListingUrl.

async function getMacServerUrl(redis: ReturnType<typeof getRedis>) {
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  const url = typeof raw === "string" ? raw : String(raw);
  return url.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const redis = getRedis();
    const serverUrl = await getMacServerUrl(redis);
    if (!serverUrl) {
      return Response.json(
        { error: "Mac marketplace-server is not reachable" },
        { status: 503 }
      );
    }

    const secret = process.env.MERCARI_SERVER_SECRET;
    const res = await fetch(`${serverUrl}/mercari/scrape-listings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Mercari-Secret": secret } : {}),
      },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text.substring(0, 500) };
    }
    if (!res.ok) {
      return Response.json(
        { error: "Scrape failed", details: data?.error || data },
        { status: res.status }
      );
    }

    const scraped: Array<{
      url: string;
      title: string;
      price: number | null;
      photoUrl: string;
      daysListed: number | null;
      listedText: string;
    }> = data.items || [];

    // Load existing listings and dedupe by mercariListingUrl
    const raw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = raw
      ? typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as ListingDraft[])
      : [];
    const existingUrls = new Set(
      listings
        .map((l) => l.mercariListingUrl)
        .filter(Boolean) as string[]
    );

    const now = new Date();
    const nowIso = now.toISOString();
    const added: ListingDraft[] = [];
    for (const item of scraped) {
      if (!item.url || existingUrls.has(item.url)) continue;
      // Back-date createdAt using the scraped "X days ago" hint so the
      // inventory page shows the real age.
      const createdAt =
        item.daysListed != null
          ? new Date(
              now.getTime() - item.daysListed * 24 * 60 * 60 * 1000
            ).toISOString()
          : nowIso;
      added.push({
        id: `imp_mrc_${crypto.randomBytes(6).toString("hex")}`,
        photos: item.photoUrl ? [item.photoUrl] : [],
        title: item.title || "(untitled)",
        description: "",
        price: item.price ?? null,
        quantity: 1,
        condition: "",
        category: "",
        platforms: ["mercari"],
        status: "listed",
        mercariStatus: "listed",
        mercariListingUrl: item.url,
        createdAt,
        updatedAt: nowIso,
      });
    }

    if (added.length > 0) {
      const updated = [...listings, ...added];
      await redis.set(REDIS_KEYS.listings, JSON.stringify(updated));
    }

    return Response.json({
      success: true,
      scrapedCount: scraped.length,
      importedCount: added.length,
      skippedCount: scraped.length - added.length,
      reachedUrl: data.reachedUrl,
      firstCardPreview: data.firstCardPreview,
    });
  } catch (error: any) {
    console.error("import-mercari error:", error);
    return Response.json(
      { error: "Import failed", details: error.message },
      { status: 500 }
    );
  }
}
