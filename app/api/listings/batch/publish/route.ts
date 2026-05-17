// app/api/listings/batch/publish/route.ts
import { NextRequest } from "next/server";
import { appendQty } from "@/lib/marketplace-batch";

export const maxDuration = 800;

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
    url = `${baseUrl}/api/listings/publish/${platform}`;
    body = {
      listingId: draft.productId,
      step: "start",
      listing: {
        title: draft.title,
        description: appendQty(draft.description, draft.quantity),
        price: draft.price,
        condition: draft.condition,
        brand: draft.brand,
        photos: draft.blobUrls,
        weight_lbs: draft.weight_lbs,
        dims_in: draft.dims_in,
        category: draft.category,
        ...(platform === "facebook" ? { facebookLocalOnly: draft.facebookLocalOnly } : {}),
      },
    };
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
