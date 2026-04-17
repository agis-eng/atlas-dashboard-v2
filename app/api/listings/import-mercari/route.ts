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

    // Load existing listings — we both add new ones AND back-fill
    // price/photo/createdAt on existing imports where the scraper now
    // has better data.
    const raw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = raw
      ? typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as ListingDraft[])
      : [];
    const byUrl = new Map<string, ListingDraft>();
    for (const l of listings) {
      if (l.mercariListingUrl) byUrl.set(l.mercariListingUrl, l);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let addedCount = 0;
    let updatedCount = 0;
    const mutated = new Set<string>();

    for (const item of scraped) {
      if (!item.url) continue;
      const createdAt =
        item.daysListed != null
          ? new Date(
              now.getTime() - item.daysListed * 24 * 60 * 60 * 1000
            ).toISOString()
          : null;

      const existing = byUrl.get(item.url);
      if (existing) {
        // Back-fill missing fields without overwriting user-edited data
        let changed = false;
        if ((existing.price == null || existing.price === 0) && item.price != null) {
          existing.price = item.price;
          changed = true;
        }
        if ((!existing.photos || existing.photos.length === 0) && item.photoUrl) {
          existing.photos = [item.photoUrl];
          changed = true;
        }
        if (!existing.title || existing.title === "(untitled)") {
          if (item.title && item.title !== "(untitled)") {
            existing.title = item.title;
            changed = true;
          }
        }
        if (createdAt) {
          // Only back-date if our current createdAt is clearly a placeholder
          // (import stamped "now") AND scraper gave us an older date.
          const existingCreated = new Date(existing.createdAt).getTime();
          const scrapedCreated = new Date(createdAt).getTime();
          if (scrapedCreated < existingCreated - 24 * 60 * 60 * 1000) {
            existing.createdAt = createdAt;
            changed = true;
          }
        }
        if (changed) {
          existing.updatedAt = nowIso;
          mutated.add(existing.id);
          updatedCount++;
        }
      } else {
        const newListing: ListingDraft = {
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
          createdAt: createdAt || nowIso,
          updatedAt: nowIso,
        };
        listings.push(newListing);
        byUrl.set(item.url, newListing);
        addedCount++;
      }
    }

    if (addedCount > 0 || updatedCount > 0) {
      await redis.set(REDIS_KEYS.listings, JSON.stringify(listings));
    }

    return Response.json({
      success: true,
      scrapedCount: scraped.length,
      importedCount: addedCount,
      updatedCount,
      skippedCount: scraped.length - addedCount - updatedCount,
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
