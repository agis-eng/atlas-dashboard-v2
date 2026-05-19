// app/api/listings/batch/publish/route.ts
import { NextRequest } from "next/server";
import { appendQty } from "@/lib/marketplace-batch";

export const maxDuration = 300;

const CONCURRENCY = 2;

type Platform = "ebay" | "mercari" | "facebook";

interface RowDraft {
  productId: string;
  title: string;
  description: string;
  condition: string;
  price: number;
  quantity: number;
  weight_lbs: number;
  dims_in: { length: number; width: number; height: number };
  category: string;
  brand?: string;
  size?: string;
  sizeType?: string;
  blobUrls: string[];
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
}

interface PublishEvent {
  productId: string;
  platform: Platform;
  status: "started" | "success" | "failed";
  error?: string;
}

async function ensureListingRecord(
  draft: RowDraft,
  baseUrl: string,
  cookieHeader: string
): Promise<void> {
  const now = new Date().toISOString();
  const platforms: ("ebay" | "mercari" | "facebook")[] = [];
  if (draft.platforms.ebay) platforms.push("ebay");
  if (draft.platforms.mercari) platforms.push("mercari");
  if (draft.platforms.facebook) platforms.push("facebook");

  const body = {
    id: draft.productId,
    photos: draft.blobUrls,
    title: draft.title,
    description: draft.description,
    price: draft.price,
    quantity: draft.quantity,
    condition: draft.condition,
    category: draft.category,
    brand: draft.brand,
    size: draft.size,
    sizeType: draft.sizeType,
    platforms,
    status: "ready",
    weightOz: Math.round((draft.weight_lbs || 1) * 16),
    lengthIn: draft.dims_in?.length,
    widthIn: draft.dims_in?.width,
    heightIn: draft.dims_in?.height,
    facebookLocalOnly: draft.facebookLocalOnly,
    createdAt: now,
    updatedAt: now,
  };

  const res = await fetch(`${baseUrl}/api/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to persist listing record: HTTP ${res.status}`);
  }
}

async function publishOne(
  platform: Platform,
  draft: RowDraft,
  baseUrl: string,
  cookieHeader: string
): Promise<{ ok: boolean; error?: string }> {
  const sku = `batch-${draft.productId.slice(0, 8)}`;
  let url: string;
  let body: any;

  if (platform === "ebay") {
    url = `${baseUrl}/api/listings/publish/ebay`;
    body = {
      listingId: draft.productId,
      sku,
      draft: {
        title: draft.title,
        description: draft.description,
        price: draft.price,
        quantity: draft.quantity,
        condition: draft.condition,
        brand: draft.brand,
        size: draft.size,
        sizeType: draft.sizeType,
        photos: draft.blobUrls,
      },
    };
  } else {
    // Mercari/Facebook: drive start → fill → submit
    const url = `${baseUrl}/api/listings/publish/${platform}`;
    // Suppress unused-var warning for appendQty in this branch
    void appendQty;
    async function postStep(step: string, sessionId?: string): Promise<any> {
      const body: any = { listingId: draft.productId, step };
      if (sessionId) body.sessionId = sessionId;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || `HTTP ${res.status}`);
      }
      return data;
    }

    try {
      const startData = await postStep("start");
      const sessionId = startData.sessionId || "";
      await postStep("fill", sessionId);
      const submitData = await postStep("submit", sessionId);
      if (submitData.success === false) {
        return { ok: false, error: submitData.details || submitData.error || "Publish did not complete" };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.error || data.errors?.[0]?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function publishRow(
  draft: RowDraft,
  baseUrl: string,
  cookieHeader: string,
  emit: (evt: PublishEvent) => void
): Promise<void> {
  const needsRedisRecord = draft.platforms.mercari || draft.platforms.facebook;
  if (needsRedisRecord) {
    try {
      await ensureListingRecord(draft, baseUrl, cookieHeader);
    } catch (err) {
      // Emit failed events for Mercari and Facebook so the UI shows the error
      for (const p of ["mercari", "facebook"] as const) {
        if (draft.platforms[p]) {
          emit({ productId: draft.productId, platform: p, status: "started" });
          emit({ productId: draft.productId, platform: p, status: "failed", error: (err as Error).message });
        }
      }
      // Strip them so we don't double-emit in the Promise.allSettled below
      draft.platforms.mercari = false;
      draft.platforms.facebook = false;
      // If ebay is also off, nothing to do
    }
  }

  const platforms: Platform[] = [];
  if (draft.platforms.ebay) platforms.push("ebay");
  if (draft.platforms.mercari) platforms.push("mercari");
  if (draft.platforms.facebook) platforms.push("facebook");

  await Promise.allSettled(platforms.map(async (platform) => {
    emit({ productId: draft.productId, platform, status: "started" });
    const result = await publishOne(platform, draft, baseUrl, cookieHeader);
    emit({
      productId: draft.productId,
      platform,
      status: result.ok ? "success" : "failed",
      ...(result.error ? { error: result.error } : {}),
    });
  }));
}

export async function POST(request: NextRequest) {
  const { getSessionUserFromRequest } = await import("@/lib/auth");
  const user = await getSessionUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { drafts } = await request.json() as { drafts: RowDraft[] };
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return Response.json({ error: "No drafts provided" }, { status: 400 });
  }

  const baseUrl = new URL(request.url).origin;
  const cookieHeader = request.headers.get("cookie") || "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let idx = 0;
      async function worker() {
        while (idx < drafts.length) {
          const myIdx = idx++;
          await publishRow(drafts[myIdx], baseUrl, cookieHeader, send);
        }
      }

      try {
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        send({ done: true });
      } catch (err) {
        send({ error: (err as Error).message, done: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
