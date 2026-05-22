// app/api/listings/batch/group/route.ts
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { groupByExifGap, PhotoGroup, PhotoRecord } from "@/lib/marketplace-batch";

const anthropic = new Anthropic();

export const maxDuration = 120;

const DEFAULT_GAP_SECONDS = Number(process.env.BATCH_GROUP_GAP_SECONDS) || 90;

interface VisionVerdict {
  verdict: "yes" | "split" | "merge_previous";
  splitInto?: number[][];
}

async function fetchAsBase64Image(url: string): Promise<Anthropic.Messages.ImageBlockParam | null> {
  try {
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64 = buffer.toString("base64");
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return {
      type: "image",
      source: { type: "base64", media_type: contentType as any, data: base64 },
    };
  } catch {
    return null;
  }
}

async function visionVerdictForGroup(group: PhotoGroup): Promise<VisionVerdict | null> {
  const urls = group.blobUrls.slice(0, 6);
  const images = (await Promise.all(urls.map(fetchAsBase64Image))).filter(Boolean) as Anthropic.Messages.ImageBlockParam[];
  if (images.length === 0) return null;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: [
        ...images,
        {
          type: "text",
          text: `Do all these photos show the same physical item being resold? Reply with strict JSON only, no commentary:
{"verdict": "yes" | "split" | "merge_previous", "splitInto"?: number[][]}

- "yes" if all photos are the same item
- "split" if the photos contain multiple different items (provide splitInto: array of arrays of zero-based indices, one inner array per resulting item)
- "merge_previous" if this looks like a continuation of the previous item (rare)`,
        },
      ],
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  try {
    const raw = textBlock.text.replace(/```json\s*|\s*```/g, "").trim();
    return JSON.parse(raw) as VisionVerdict;
  } catch {
    return null;
  }
}

function applyVerdict(group: PhotoGroup, verdict: VisionVerdict): PhotoGroup[] {
  if (verdict.verdict === "yes") return [group];
  if (verdict.verdict === "split" && verdict.splitInto && verdict.splitInto.length > 0) {
    return verdict.splitInto.map(indices => ({
      productId: randomUUID(),
      photoIds: indices.map(i => group.photoIds[i]).filter(Boolean),
      blobUrls: indices.map(i => group.blobUrls[i]).filter(Boolean),
      lowConfidence: false,
    }));
  }
  return [group];
}

export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const photos: PhotoRecord[] = body.photos || [];
    const gapSeconds = typeof body.gapSeconds === "number" ? body.gapSeconds : DEFAULT_GAP_SECONDS;

    if (photos.length === 0) {
      return Response.json({ groups: [] });
    }

    // Pass 1: EXIF clustering (pure)
    const groups = groupByExifGap(photos, gapSeconds);

    // Pass 2: vision sanity check per group
    const refined: PhotoGroup[] = [];
    for (const group of groups) {
      if (group.lowConfidence) {
        // Skip vision for the no-EXIF tail group; it's already flagged
        refined.push(group);
        continue;
      }
      const verdict = await visionVerdictForGroup(group);
      if (!verdict) {
        refined.push({ ...group, lowConfidence: true, confidenceReason: "Vision check failed" });
        continue;
      }
      if (verdict.verdict === "merge_previous" && refined.length > 0) {
        const prev = refined[refined.length - 1];
        prev.photoIds.push(...group.photoIds);
        prev.blobUrls.push(...group.blobUrls);
      } else {
        refined.push(...applyVerdict(group, verdict));
      }
    }

    return Response.json({ groups: refined });
  } catch (err) {
    console.error("[batch/group] error", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
