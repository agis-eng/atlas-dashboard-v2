import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// "Photos ready" button: pulls loose photos from the Mac's ~/Desktop/listing pics
// folder (via the local mercari-server), groups them by item, AI-analyzes each
// group into a draft, and saves them to the Drafts tab. The Mac server uploads
// the bytes to Blob and archives the originals; this route does the grouping,
// analysis, and persistence.

interface IngestedPhoto {
  photoId: string;
  blobUrl: string;
  exifTimestampMs: number | null;
}

interface AnalyzedDraft {
  productId?: string;
  blobUrls?: string[];
  title?: string;
  description?: string;
  condition?: string;
  price?: number | null;
  weight_lbs?: number;
  dims_in?: { length: number; width: number; height: number };
  category?: string;
  brand?: string;
  quantity?: number;
  platforms?: Record<string, boolean> | string[];
}

export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const redis = getRedis();
    const rawUrl = await redis.get(REDIS_KEYS.mercariServerUrl);
    const serverUrl =
      typeof rawUrl === "string" ? rawUrl : (rawUrl as { url?: string })?.url;
    if (!serverUrl) {
      return Response.json({ error: "Mac server URL not configured" }, { status: 503 });
    }
    const secret = process.env.MERCARI_SERVER_SECRET;
    const baseUrl = new URL(request.url).origin;
    const svcKey = process.env.BLOB_READ_WRITE_TOKEN || "";

    // 1) Pull + upload photos from the Mac desktop folder.
    const ingRes = await fetch(`${serverUrl}/ingest-photos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Mercari-Secret": secret } : {}),
      },
    });
    const ingData = (await ingRes.json()) as { photos?: IngestedPhoto[]; count?: number; error?: string };
    if (!ingRes.ok) {
      return Response.json({ error: ingData.error || "Mac server ingest failed" }, { status: 502 });
    }
    const photos = ingData.photos || [];
    if (photos.length === 0) {
      return Response.json({ created: 0, note: "No new photos in the listing-pics folder." });
    }

    // 2) Group by EXIF time + vision check.
    const gRes = await fetch(`${baseUrl}/api/listings/batch/group`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-service-key": svcKey },
      body: JSON.stringify({ photos, gapSeconds: 45 }),
    });
    const groups = ((await gRes.json()) as { groups?: unknown[] }).groups || [];
    if (groups.length === 0) {
      return Response.json({ created: 0, note: "Photos uploaded but no groups formed." });
    }

    // 3) AI-analyze each group into a draft.
    const aRes = await fetch(`${baseUrl}/api/listings/batch/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-service-key": svcKey },
      body: JSON.stringify({ groups }),
    });
    const drafts = ((await aRes.json()) as { drafts?: AnalyzedDraft[] }).drafts || [];
    const usable = drafts.filter((d) => (d.blobUrls || []).length > 0 && (d.title || "").trim());

    // 4) Persist as drafts in the main listings store.
    const now = new Date().toISOString();
    const newListings: ListingDraft[] = usable.map((d) => {
      const plats = Array.isArray(d.platforms)
        ? d.platforms
        : Object.keys(d.platforms || {}).filter((k) => (d.platforms as Record<string, boolean>)[k]);
      const L: Record<string, unknown> = {
        id: d.productId || randomUUID(),
        photos: d.blobUrls,
        title: d.title,
        description: d.description || "",
        price: d.price ?? null,
        quantity: d.quantity || 1,
        condition: d.condition || "New",
        brand: d.brand || "",
        category: d.category || "",
        platforms: plats.length ? plats : ["ebay", "mercari", "facebook", "craigslist"],
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
      if (d.weight_lbs) L.weightOz = Math.round(d.weight_lbs * 16);
      if (d.dims_in) {
        L.lengthIn = d.dims_in.length;
        L.widthIn = d.dims_in.width;
        L.heightIn = d.dims_in.height;
      }
      return L as unknown as ListingDraft;
    });

    const existing = ((await redis.get(REDIS_KEYS.listings)) as ListingDraft[] | null) || [];
    await redis.set(REDIS_KEYS.listings, [...newListings, ...existing]);

    return Response.json({
      created: newListings.length,
      photos: photos.length,
      titles: newListings.map((l) => l.title),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
