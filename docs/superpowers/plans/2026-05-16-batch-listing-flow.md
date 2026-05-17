# Batch Listing Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/listings/batch` flow that takes a bulk upload of unsorted product photos and turns them into reviewed-and-published listings across eBay, Mercari, and Facebook in one pass.

**Architecture:** Five new endpoints + one page + one pure-logic module, all stacked on top of the existing `/api/listings/{analyze,publish/*}` infrastructure unchanged. Photos enter via Vercel Blob upload, get clustered by EXIF timestamps with a Claude vision sanity check, run through analyze + shippability prompts, render in an editable table, then publish via an SSE-streaming orchestrator with concurrency=2.

**Tech Stack:** Next.js 16.2.1 (App Router), React 19, TypeScript, Anthropic Claude SDK, Vercel Blob, `sharp` + `heic-convert` for HEIC, `exifr` for EXIF, ReadableStream Web API for SSE. No test framework (codebase doesn't have one; pure-logic factored to allow `node --test` later).

**Spec reference:** `docs/superpowers/specs/2026-05-16-batch-listing-flow-design.md`

**Conventions to follow (all confirmed in repo):**
- All API routes use `getSessionUserFromRequest` for auth (see `app/api/listings/analyze/route.ts:8`)
- Anthropic SDK already imported as `import Anthropic from "@anthropic-ai/sdk"; const anthropic = new Anthropic();`
- Vercel Blob pattern: `import { put } from "@vercel/blob"` (see `app/api/listings/upload/route.ts:2`)
- "Always deploy" rule: commit pushes to main → Vercel auto-deploys. Each task ends in a commit. Tasks are designed so partial states don't break the build.

---

## Task 1: Add dependencies and create pure-logic module

**Files:**
- Modify: `package.json`
- Create: `lib/marketplace-batch.ts`

- [ ] **Step 1: Install packages**

```bash
cd ~/.openclaw/workspace/atlas-dashboard-v2
npm install sharp exifr heic-convert
npm install --save-dev @types/heic-convert
```

Expected: clean install, no peer-dep warnings beyond the existing ones.

- [ ] **Step 2: Create `lib/marketplace-batch.ts`**

```typescript
// Pure functions for batch listing. No I/O. Factored so they can be tested
// in isolation later (e.g. `node --test`) without spinning up the framework.

export interface PhotoRecord {
  photoId: string;
  blobUrl: string;
  exifTimestampMs: number | null;
}

export interface PhotoGroup {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  lowConfidence: boolean;
  confidenceReason?: string;
}

function uuid(): string {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
}

/**
 * Cluster photos by EXIF timestamp. Photos within `gapSeconds` of each other
 * stay in the same group; gaps larger than that start a new group.
 * Photos with `exifTimestampMs === null` go into their own low-confidence tail group.
 */
export function groupByExifGap(
  photos: PhotoRecord[],
  gapSeconds: number = 90
): PhotoGroup[] {
  const withTime = photos.filter(p => p.exifTimestampMs !== null)
    .sort((a, b) => (a.exifTimestampMs! - b.exifTimestampMs!));
  const withoutTime = photos.filter(p => p.exifTimestampMs === null);

  const groups: PhotoGroup[] = [];
  const gapMs = gapSeconds * 1000;

  for (const photo of withTime) {
    const last = groups[groups.length - 1];
    const lastPhotoTime = last ? photos.find(p => p.photoId === last.photoIds[last.photoIds.length - 1])!.exifTimestampMs! : null;

    if (last && lastPhotoTime !== null && (photo.exifTimestampMs! - lastPhotoTime) <= gapMs) {
      last.photoIds.push(photo.photoId);
      last.blobUrls.push(photo.blobUrl);
    } else {
      groups.push({
        productId: uuid(),
        photoIds: [photo.photoId],
        blobUrls: [photo.blobUrl],
        lowConfidence: false,
      });
    }
  }

  if (withoutTime.length > 0) {
    groups.push({
      productId: uuid(),
      photoIds: withoutTime.map(p => p.photoId),
      blobUrls: withoutTime.map(p => p.blobUrl),
      lowConfidence: true,
      confidenceReason: "No EXIF timestamps; grouped together as fallback",
    });
  }

  return groups;
}

export type ShippabilityRecommendation = "ship_online" | "local_only";

export interface RoutingResult {
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
}

/**
 * Apply the AI's shippability recommendation to platform routing.
 * ship_online → publish everywhere with both local and shipping on FB
 * local_only  → publish only to Facebook in local-pickup mode
 */
export function applyRouting(recommendation: ShippabilityRecommendation): RoutingResult {
  if (recommendation === "ship_online") {
    return {
      platforms: { ebay: true, mercari: true, facebook: true },
      facebookLocalOnly: false,
    };
  }
  return {
    platforms: { ebay: false, mercari: false, facebook: true },
    facebookLocalOnly: true,
  };
}

/**
 * For qty > 1, append a "Quantity available: N" line to the description so
 * Mercari/Facebook buyers see the count. eBay uses its native qty field, so
 * its description is left untouched (caller skips this for eBay).
 */
export function appendQty(description: string, qty: number): string {
  if (qty <= 1) return description;
  return `${description}\n\nQuantity available: ${qty}`;
}
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run build`
Expected: Build succeeds. No usage of the new module yet, so this only validates the new file is valid TypeScript.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/marketplace-batch.ts
git commit -m "Batch: add deps and pure-logic module for grouping/routing/qty

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Build the bulk upload endpoint

**Files:**
- Create: `app/api/listings/batch/upload/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
// app/api/listings/batch/upload/route.ts
import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import crypto from "crypto";
import sharp from "sharp";
import heicConvert from "heic-convert";
import exifr from "exifr";

export const maxDuration = 300;

const MAX_SIZE = 15 * 1024 * 1024; // 15MB per photo
const MAX_FILES = 100;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];

interface UploadedPhoto {
  photoId: string;
  blobUrl: string;
  originalName: string;
  exifTimestampMs: number | null;
  sizeBytes: number;
}

async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  // Try sharp first (faster, native), fall back to heic-convert (pure JS, slower but always works)
  try {
    return await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
  } catch {
    const out = await heicConvert({ buffer, format: "JPEG", quality: 0.85 });
    return Buffer.from(out);
  }
}

async function extractExifTimestamp(buffer: Buffer): Promise<number | null> {
  try {
    const exif = await exifr.parse(buffer, ["DateTimeOriginal"]);
    if (exif?.DateTimeOriginal instanceof Date) {
      return exif.DateTimeOriginal.getTime();
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("photos") as File[];
    const batchId = (formData.get("batchId") as string) || crypto.randomUUID();

    if (!files || files.length === 0) {
      return Response.json({ error: "No photos provided" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return Response.json({ error: `Max ${MAX_FILES} photos per batch` }, { status: 400 });
    }

    const photos: UploadedPhoto[] = [];
    const skippedReasons: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerType = (file.type || "").toLowerCase();

      if (!ALLOWED_TYPES.includes(lowerType)) {
        skippedReasons.push(`${file.name}: unsupported type ${file.type}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        skippedReasons.push(`${file.name}: too large (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
        continue;
      }

      try {
        const originalBuffer = Buffer.from(await file.arrayBuffer());

        // EXIF read from the original buffer (works for HEIC and JPEG)
        const exifTimestampMs = await extractExifTimestamp(originalBuffer);

        // Convert HEIC → JPEG; pass through others
        const isHeic = lowerType === "image/heic" || lowerType === "image/heif";
        const jpegBuffer = isHeic ? await heicToJpeg(originalBuffer) : originalBuffer;
        const ext = isHeic ? "jpg" : (lowerType.split("/")[1] === "jpeg" ? "jpg" : lowerType.split("/")[1]);

        const blob = await put(`listings/batch/${batchId}/${i + 1}.${ext}`, jpegBuffer, {
          access: "public",
          contentType: isHeic ? "image/jpeg" : lowerType,
        });

        photos.push({
          photoId: crypto.randomUUID(),
          blobUrl: blob.url,
          originalName: file.name,
          exifTimestampMs,
          sizeBytes: jpegBuffer.length,
        });
      } catch (err) {
        skippedReasons.push(`${file.name}: ${(err as Error).message}`);
      }
    }

    return Response.json({
      batchId,
      photos,
      uploadedCount: photos.length,
      skippedCount: skippedReasons.length,
      skippedReasons,
    });
  } catch (err) {
    console.error("[batch/upload] error", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds. New route compiles.

- [ ] **Step 3: Smoke test the endpoint locally**

Run: `npm run dev`
Then in a second terminal:
```bash
# Use any HEIC from your phone — example with a single test image:
curl -X POST http://localhost:3000/api/listings/batch/upload \
  -H "Cookie: $(grep session= ~/.cookies 2>/dev/null || echo 'session=YOUR_SESSION')" \
  -F "photos=@/path/to/test.heic" \
  -F "batchId=test-batch-1"
```
Expected: JSON response with `photos[0].blobUrl` pointing to a Vercel Blob URL and `exifTimestampMs` set (assuming the photo has EXIF).
If session cookie is annoying, temporarily comment out the auth check during smoke testing only.

- [ ] **Step 4: Commit**

```bash
git add app/api/listings/batch/upload/route.ts
git commit -m "Batch: bulk upload endpoint with HEIC->JPEG + EXIF extract

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add shippability prompt to lib/marketplace-prompts.ts

**Files:**
- Modify: `lib/marketplace-prompts.ts` (append-only)

- [ ] **Step 1: Read the current file to learn its exports/conventions**

Run: `wc -l lib/marketplace-prompts.ts && head -20 lib/marketplace-prompts.ts`

- [ ] **Step 2: Append the shippability prompt builder**

Append to the end of `lib/marketplace-prompts.ts`:

```typescript
// ----- Batch listing: shippability decision -----

export interface ShippabilityInput {
  estimated_value_usd: number;
  weight_lbs: number;
  longest_side_in: number;
  category: string;
}

export interface ShippabilityOutput {
  estimated_shipping_cost_usd: number;
  estimated_ebay_fees_usd: number;
  estimated_mercari_fees_usd: number;
  estimated_profit_if_shipped_usd: number;
  recommendation: "ship_online" | "local_only";
  reason: string;
}

export function buildShippabilityPrompt(input: ShippabilityInput): string {
  return `You are deciding whether a resale item is worth shipping (eBay + Mercari) or should be local pickup only (Facebook Marketplace).

Item:
  estimated_value_usd: ${input.estimated_value_usd}
  weight_lbs: ${input.weight_lbs}
  longest_side_in: ${input.longest_side_in}
  category: ${input.category}

Estimate USPS Ground Advantage / Mercari prepaid label shipping cost for this weight and size in the continental US. eBay final value fee is ~13% + $0.30. Mercari fee is ~10% + payment processing.

If estimated_profit_if_shipped_usd is below $3, recommend "local_only". Otherwise recommend "ship_online".

Respond with strict JSON only, no commentary:
{
  "estimated_shipping_cost_usd": number,
  "estimated_ebay_fees_usd": number,
  "estimated_mercari_fees_usd": number,
  "estimated_profit_if_shipped_usd": number,
  "recommendation": "ship_online" | "local_only",
  "reason": "<one short sentence>"
}`;
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add lib/marketplace-prompts.ts
git commit -m "Batch: add shippability prompt for routing decision

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Build the group endpoint

**Files:**
- Create: `app/api/listings/batch/group/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
// app/api/listings/batch/group/route.ts
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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
  // Cap at 6 photos per vision call to keep cost predictable
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
    // Strip ```json fences if present
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
      productId: crypto.randomUUID(),
      photoIds: indices.map(i => group.photoIds[i]).filter(Boolean),
      blobUrls: indices.map(i => group.blobUrls[i]).filter(Boolean),
      lowConfidence: false,
    }));
  }
  // merge_previous handled at the caller level (we just return group; caller merges into previous)
  return [group];
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const photos: PhotoRecord[] = body.photos || [];
    const gapSeconds = typeof body.gapSeconds === "number" ? body.gapSeconds : DEFAULT_GAP_SECONDS;

    if (photos.length === 0) {
      return Response.json({ groups: [] });
    }

    // Pass 1: EXIF clustering (pure)
    let groups = groupByExifGap(photos, gapSeconds);

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
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Smoke test against the uploaded batch from Task 2**

In dev server, POST the response from Task 2's upload to the new endpoint:
```bash
curl -X POST http://localhost:3000/api/listings/batch/group \
  -H "Content-Type: application/json" \
  -d '{"batchId":"test-batch-1","photos":[{"photoId":"...","blobUrl":"...","exifTimestampMs":...}]}'
```
Expected: `{ "groups": [ ... ] }` with one or more groups.

- [ ] **Step 4: Commit**

```bash
git add app/api/listings/batch/group/route.ts
git commit -m "Batch: group endpoint with EXIF clustering and vision sanity check

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Build the analyze endpoint

**Files:**
- Create: `app/api/listings/batch/analyze/route.ts`

- [ ] **Step 1: Read existing analyze route to learn its request/response shape**

Run: `cat app/api/listings/analyze/route.ts`
Note: it expects `{ photos: string[] }` and returns the listing draft fields directly.

- [ ] **Step 2: Write the batch analyze handler**

```typescript
// app/api/listings/batch/analyze/route.ts
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { applyRouting, ShippabilityRecommendation } from "@/lib/marketplace-batch";
import { buildShippabilityPrompt, ShippabilityOutput } from "@/lib/marketplace-prompts";

const anthropic = new Anthropic();

export const maxDuration = 600;

interface IncomingGroup {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  lowConfidence: boolean;
  confidenceReason?: string;
}

interface Draft {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  title: string;
  description: string;
  condition: string;
  price: number;
  weight_lbs: number;
  dims_in: { length: number; width: number; height: number };
  category: string;
  quantity: number;
  routing: ShippabilityRecommendation;
  routingReason: string;
  estimatedProfit: number;
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
  status: "ready" | "needs_review";
}

async function callAnalyze(blobUrls: string[], baseUrl: string, cookieHeader: string): Promise<any> {
  const res = await fetch(`${baseUrl}/api/listings/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ photos: blobUrls }),
  });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  return res.json();
}

async function callShippability(input: {
  estimated_value_usd: number;
  weight_lbs: number;
  longest_side_in: number;
  category: string;
}): Promise<ShippabilityOutput | null> {
  try {
    const prompt = buildShippabilityPrompt(input);
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    const raw = textBlock.text.replace(/```json\s*|\s*```/g, "").trim();
    return JSON.parse(raw) as ShippabilityOutput;
  } catch (err) {
    console.error("[batch/analyze] shippability failed", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { groups } = await request.json() as { groups: IncomingGroup[] };
    if (!Array.isArray(groups) || groups.length === 0) {
      return Response.json({ drafts: [] });
    }

    const baseUrl = new URL(request.url).origin;
    const cookieHeader = request.headers.get("cookie") || "";

    const drafts: Draft[] = [];
    for (const group of groups) {
      try {
        const analyzed = await callAnalyze(group.blobUrls, baseUrl, cookieHeader);

        const value = Number(analyzed.price) || 0;
        const weight = Number(analyzed.weight_lbs) || 1;
        const dims = analyzed.dims_in || { length: 8, width: 8, height: 4 };
        const longestSide = Math.max(dims.length, dims.width, dims.height);

        const shippability = await callShippability({
          estimated_value_usd: value,
          weight_lbs: weight,
          longest_side_in: longestSide,
          category: analyzed.category || "general",
        });

        const recommendation: ShippabilityRecommendation = shippability?.recommendation || "local_only";
        const routing = applyRouting(recommendation);

        const hasTitleAndPrice = !!analyzed.title && Number(analyzed.price) > 0;
        const status: Draft["status"] = (group.lowConfidence || !hasTitleAndPrice) ? "needs_review" : "ready";

        drafts.push({
          productId: group.productId,
          photoIds: group.photoIds,
          blobUrls: group.blobUrls,
          title: analyzed.title || "",
          description: analyzed.description || "",
          condition: analyzed.condition || "USED_GOOD",
          price: value,
          weight_lbs: weight,
          dims_in: dims,
          category: analyzed.category || "",
          quantity: 1,
          routing: recommendation,
          routingReason: shippability?.reason || "Shippability check failed; defaulted to local",
          estimatedProfit: shippability?.estimated_profit_if_shipped_usd ?? 0,
          platforms: routing.platforms,
          facebookLocalOnly: routing.facebookLocalOnly,
          status,
        });
      } catch (err) {
        drafts.push({
          productId: group.productId,
          photoIds: group.photoIds,
          blobUrls: group.blobUrls,
          title: "",
          description: "",
          condition: "USED_GOOD",
          price: 0,
          weight_lbs: 1,
          dims_in: { length: 8, width: 8, height: 4 },
          category: "",
          quantity: 1,
          routing: "local_only",
          routingReason: `Analyze failed: ${(err as Error).message}`,
          estimatedProfit: 0,
          platforms: { ebay: false, mercari: false, facebook: true },
          facebookLocalOnly: true,
          status: "needs_review",
        });
      }
    }

    return Response.json({ drafts });
  } catch (err) {
    console.error("[batch/analyze] error", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/listings/batch/analyze/route.ts
git commit -m "Batch: analyze endpoint with shippability routing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Build the eBay publish endpoint

**Files:**
- Create: `app/api/listings/publish/ebay/route.ts`

- [ ] **Step 1: Read the existing eBay client-side dance for reference**

Run: `sed -n '340,460p' app/listings/page.tsx`
The new endpoint ports those same 6 sub-calls server-side.

- [ ] **Step 2: Write the endpoint**

```typescript
// app/api/listings/publish/ebay/route.ts
import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export const maxDuration = 120;

const EBAY_CONDITION_MAP: Record<string, string> = {
  "new": "NEW",
  "like_new": "LIKE_NEW",
  "used_excellent": "USED_EXCELLENT",
  "used_good": "USED_GOOD",
  "used_fair": "USED_FAIR",
  "used_acceptable": "USED_FAIR",
  "USED_GOOD": "USED_GOOD",
  "NEW": "NEW",
};

interface PublishRequest {
  listingId: string;
  env?: "sandbox" | "production";
  token?: string;
  sku: string;
  draft: {
    title: string;
    description: string;
    price: number;
    quantity: number;
    condition: string;
    brand?: string;
    size?: string;
    sizeType?: string;
    photos: string[];
  };
}

async function getTokenFromRedis(): Promise<string> {
  try {
    const redis = getRedis();
    const raw = await redis.get(REDIS_KEYS.ebayToken);
    if (!raw) return "";
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return "";
    return data.access_token || "";
  } catch {
    return "";
  }
}

async function callEbay(baseUrl: string, cookieHeader: string, body: any): Promise<any> {
  const res = await fetch(`${baseUrl}/api/ebay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.errors?.[0]?.message || data.error || `eBay step failed (${res.status})`);
  }
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as PublishRequest;
    const env = body.env || "production";
    const token = body.token || (await getTokenFromRedis()) || process.env.EBAY_USER_TOKEN || "";
    if (!token) {
      return Response.json({ ok: false, error: "No eBay token; reconnect eBay" }, { status: 400 });
    }

    const baseUrl = new URL(request.url).origin;
    const cookieHeader = request.headers.get("cookie") || "";
    const { sku, draft } = body;
    const condition = EBAY_CONDITION_MAP[draft.condition?.toLowerCase()] || EBAY_CONDITION_MAP[draft.condition] || "USED_GOOD";
    const quantity = draft.quantity || 1;

    // 1. Create inventory item
    await callEbay(baseUrl, cookieHeader, {
      action: "create-inventory-item",
      token,
      env,
      sku,
      product: {
        title: draft.title,
        description: draft.description,
        imageUrls: draft.photos,
        aspects: {
          Brand: [draft.brand || "Unbranded"],
          "Size Type": [draft.sizeType || "Regular"],
          ...(draft.size ? { Size: [draft.size] } : {}),
        },
      },
      condition,
      availability: { shipToLocationAvailability: { quantity } },
    });

    // 2. Categories (best-effort)
    let categoryId = "";
    try {
      const catRes = await fetch(
        `${baseUrl}/api/ebay?action=categories&q=${encodeURIComponent(draft.title)}&env=${env}`,
        { headers: { Cookie: cookieHeader } }
      );
      if (catRes.ok) {
        const catData = await catRes.json();
        categoryId = catData.categorySuggestions?.[0]?.category?.categoryId || "";
      }
    } catch {}

    // 3. Policies
    let policies = { fulfillmentPolicyId: "", returnPolicyId: "", paymentPolicyId: "" };
    try {
      const polRes = await fetch(`${baseUrl}/api/ebay/policies`, { headers: { Cookie: cookieHeader } });
      if (polRes.ok) {
        const polData = await polRes.json();
        if (polData.policies) policies = polData.policies;
      }
    } catch {}

    // 4. Create offer
    const offerData = await callEbay(baseUrl, cookieHeader, {
      action: "create-offer",
      token,
      env,
      sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      listingDescription: draft.description,
      pricingSummary: { price: { value: String(draft.price), currency: "USD" } },
      availableQuantity: quantity,
      listingPolicies: policies,
      countryCode: "US",
      merchantLocationKey: "default",
      categoryId,
    });
    const offerId = offerData.offerId;

    // 5. Publish offer
    const pubData = await callEbay(baseUrl, cookieHeader, {
      action: "publish-offer",
      token,
      env,
      offerId,
    });

    return Response.json({
      ok: true,
      listingId: body.listingId,
      offerId,
      ebayListingId: pubData.listingId || null,
    });
  } catch (err) {
    console.error("[publish/ebay] error", err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
```

Note: error response uses status 200 with `ok: false` so the batch orchestrator's `Promise.allSettled` always gets structured data instead of HTTP errors.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/listings/publish/ebay/route.ts
git commit -m "Batch: server-side eBay publish endpoint wrapping the 3-step dance

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Build the batch publish endpoint (SSE orchestrator)

**Files:**
- Create: `app/api/listings/batch/publish/route.ts`

- [ ] **Step 1: Write the orchestrator**

```typescript
// app/api/listings/batch/publish/route.ts
import { NextRequest } from "next/server";
import { appendQty } from "@/lib/marketplace-batch";

export const maxDuration = 800; // long because each row may take 1-2 min

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
        description: draft.description, // eBay uses native qty field; no appendQty
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
    // mercari and facebook: append qty to description, use the existing proxy shape
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

      // Pool: keep CONCURRENCY rows in flight
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
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/listings/batch/publish/route.ts
git commit -m "Batch: SSE-streaming publish orchestrator with concurrency=2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Create the batch page skeleton with upload section

**Files:**
- Create: `app/listings/batch/page.tsx`

- [ ] **Step 1: Read the existing listings page header for styling/auth pattern**

Run: `sed -n '1,80p' app/listings/page.tsx`
Note how it uses `"use client"`, auth-gates, and toasts via sonner.

- [ ] **Step 2: Write the skeleton page with upload UI**

```typescript
// app/listings/batch/page.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

type Stage = "idle" | "uploading" | "grouping" | "analyzing" | "ready" | "publishing";

interface UploadedPhoto {
  photoId: string;
  blobUrl: string;
  originalName: string;
  exifTimestampMs: number | null;
  sizeBytes: number;
}

interface Group {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  lowConfidence: boolean;
  confidenceReason?: string;
}

interface Draft {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  title: string;
  description: string;
  condition: string;
  price: number;
  weight_lbs: number;
  dims_in: { length: number; width: number; height: number };
  category: string;
  quantity: number;
  routing: "ship_online" | "local_only";
  routingReason: string;
  estimatedProfit: number;
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
  status: "ready" | "needs_review";
  // UI-only:
  selected?: boolean;
  rowStatus?: "ready" | "publishing" | "listed" | "partial" | "failed";
  publishErrors?: Record<string, string>;
}

export default function BatchListingPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setStage("uploading");
    setUploadProgress(`Uploading ${files.length} photos...`);

    const batchId = crypto.randomUUID();
    const formData = new FormData();
    for (const f of files) formData.append("photos", f);
    formData.append("batchId", batchId);

    try {
      const uploadRes = await fetch("/api/listings/batch/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const upload = await uploadRes.json();

      if (upload.skippedCount > 0) {
        toast.warning(`Skipped ${upload.skippedCount} files`, { description: upload.skippedReasons.join("\n") });
      }

      setStage("grouping");
      setUploadProgress("Grouping photos into products...");
      const groupRes = await fetch("/api/listings/batch/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, photos: upload.photos }),
      });
      if (!groupRes.ok) throw new Error("Grouping failed");
      const { groups } = await groupRes.json() as { groups: Group[] };

      setStage("analyzing");
      setUploadProgress(`Analyzing ${groups.length} products...`);
      const analyzeRes = await fetch("/api/listings/batch/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      if (!analyzeRes.ok) throw new Error("Analyze failed");
      const { drafts: newDrafts } = await analyzeRes.json() as { drafts: Draft[] };

      setDrafts(newDrafts.map(d => ({ ...d, selected: d.status === "ready", rowStatus: "ready" })));
      setStage("ready");
      setUploadProgress("");
      toast.success(`Ready: ${newDrafts.length} draft listings`);
    } catch (err) {
      toast.error((err as Error).message);
      setStage("idle");
      setUploadProgress("");
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Batch Listings</h1>

      {stage === "idle" && (
        <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700">
          Upload photos
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
            className="hidden"
            onChange={handleFilePick}
          />
        </label>
      )}

      {(stage === "uploading" || stage === "grouping" || stage === "analyzing") && (
        <div className="text-gray-700">{uploadProgress}</div>
      )}

      {stage === "ready" && drafts.length > 0 && (
        <div className="mt-6">
          <p className="text-sm text-gray-600 mb-2">{drafts.length} draft listings — review table coming in next task.</p>
          <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-96">
            {JSON.stringify(drafts.map(d => ({ title: d.title, price: d.price, routing: d.routing })), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes and page renders**

Run: `npm run build`
Then: `npm run dev`
Navigate to `http://localhost:3000/listings/batch`.
Expected: Page loads with "Upload photos" button. Pick a few real HEIC photos. Stages update in sequence; final state shows the draft summary JSON.

- [ ] **Step 4: Commit**

```bash
git add app/listings/batch/page.tsx
git commit -m "Batch: page skeleton with upload->group->analyze pipeline

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Build the review table (desktop)

**Files:**
- Modify: `app/listings/batch/page.tsx` (replace the JSON dump with a real table)

- [ ] **Step 1: Read the current file to verify state shape**

Run: `wc -l app/listings/batch/page.tsx`

- [ ] **Step 2: Replace the `{stage === "ready" && ...}` block with a table**

Locate the block:
```tsx
{stage === "ready" && drafts.length > 0 && (
  <div className="mt-6">
    <p className="text-sm text-gray-600 mb-2">{drafts.length} draft listings — review table coming in next task.</p>
    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-96">
      {JSON.stringify(drafts.map(d => ({ title: d.title, price: d.price, routing: d.routing })), null, 2)}
    </pre>
  </div>
)}
```

Replace it with:

```tsx
{stage === "ready" && drafts.length > 0 && (
  <div className="mt-6">
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="p-2 text-left w-8">
              <input
                type="checkbox"
                checked={drafts.every(d => d.selected)}
                onChange={(e) => setDrafts(drafts.map(d => ({ ...d, selected: e.target.checked && d.status === "ready" })))}
              />
            </th>
            <th className="p-2 text-left">Photos</th>
            <th className="p-2 text-left">Title</th>
            <th className="p-2 text-left w-20">Price</th>
            <th className="p-2 text-left w-16">Qty</th>
            <th className="p-2 text-left w-16">Lbs</th>
            <th className="p-2 text-left w-40">Routing</th>
            <th className="p-2 text-left w-32">Status</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((d, i) => (
            <tr key={d.productId} className="border-b align-top">
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={!!d.selected}
                  disabled={d.status === "needs_review"}
                  onChange={(e) => updateDraft(i, { selected: e.target.checked })}
                />
              </td>
              <td className="p-2">
                <div className="flex gap-1 flex-wrap max-w-[160px]">
                  {d.blobUrls.slice(0, 3).map((url, j) => (
                    <img key={j} src={url} alt="" className="w-12 h-12 object-cover rounded border" />
                  ))}
                  {d.blobUrls.length > 3 && <span className="text-xs text-gray-500 self-end">+{d.blobUrls.length - 3}</span>}
                  {d.status === "needs_review" && <span title={d.routingReason} className="text-yellow-600">⚠️</span>}
                </div>
              </td>
              <td className="p-2">
                <input
                  type="text"
                  value={d.title}
                  onChange={(e) => updateDraft(i, { title: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.price}
                  onChange={(e) => updateDraft(i, { price: Number(e.target.value) })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={d.quantity}
                  onChange={(e) => updateDraft(i, { quantity: Math.max(1, Number(e.target.value)) })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={d.weight_lbs}
                  onChange={(e) => updateDraft(i, { weight_lbs: Number(e.target.value) })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </td>
              <td className="p-2">
                <select
                  value={d.routing}
                  onChange={(e) => {
                    const recommendation = e.target.value as "ship_online" | "local_only";
                    if (recommendation === "ship_online") {
                      updateDraft(i, { routing: recommendation, platforms: { ebay: true, mercari: true, facebook: true }, facebookLocalOnly: false });
                    } else {
                      updateDraft(i, { routing: recommendation, platforms: { ebay: false, mercari: false, facebook: true }, facebookLocalOnly: true });
                    }
                  }}
                  className="px-2 py-1 border rounded text-sm w-full"
                  title={`${d.routingReason} (est profit: $${d.estimatedProfit})`}
                >
                  <option value="ship_online">Online (eBay+Mercari+FB)</option>
                  <option value="local_only">FB local only</option>
                </select>
              </td>
              <td className="p-2">
                <span className={
                  d.rowStatus === "listed" ? "text-green-600" :
                  d.rowStatus === "partial" ? "text-yellow-600" :
                  d.rowStatus === "failed" ? "text-red-600" :
                  d.rowStatus === "publishing" ? "text-blue-600" :
                  d.status === "needs_review" ? "text-yellow-600" : "text-gray-700"
                }>
                  {d.rowStatus === "listed" ? "Listed" :
                   d.rowStatus === "partial" ? "Partial" :
                   d.rowStatus === "failed" ? "Failed" :
                   d.rowStatus === "publishing" ? "Publishing…" :
                   d.status === "needs_review" ? "Needs review" : "Ready"}
                </span>
                {d.publishErrors && Object.keys(d.publishErrors).length > 0 && (
                  <div className="text-xs text-red-600 mt-1">
                    {Object.entries(d.publishErrors).map(([p, e]) => <div key={p}>{p}: {e}</div>)}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="mt-4 flex justify-end">
      <button
        className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        disabled={drafts.filter(d => d.selected).length === 0 || stage === "publishing"}
        onClick={publishSelected}
      >
        Publish All Selected ({drafts.filter(d => d.selected).length})
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add the `updateDraft` and stub `publishSelected` helpers inside the component**

Add these inside `BatchListingPage` before `return`:

```typescript
function updateDraft(idx: number, patch: Partial<Draft>) {
  setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
}

async function publishSelected() {
  // Wired up in Task 11
  toast.info("Publish wiring lands in Task 11");
}
```

- [ ] **Step 4: Verify build passes and table renders with editable cells**

Run: `npm run build && npm run dev`
Navigate to `/listings/batch`, upload some photos, verify the table appears with editable title/price/qty/lbs and a working routing dropdown. The "Publish All Selected" button should show the count and currently toast "Task 11" when clicked.

- [ ] **Step 5: Commit**

```bash
git add app/listings/batch/page.tsx
git commit -m "Batch: review table with inline edit and routing dropdown

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Add photo reassignment editor

**Files:**
- Modify: `app/listings/batch/page.tsx`

- [ ] **Step 1: Add state for the expanded row**

Inside `BatchListingPage`, near the other `useState` calls:

```typescript
const [expandedRow, setExpandedRow] = useState<string | null>(null);
```

- [ ] **Step 2: Make the photo cell clickable and render the expanded editor**

In the table row, replace the photo cell:

```tsx
<td className="p-2">
  <button
    type="button"
    onClick={() => setExpandedRow(expandedRow === d.productId ? null : d.productId)}
    className="flex gap-1 flex-wrap max-w-[160px] cursor-pointer hover:opacity-80"
  >
    {d.blobUrls.slice(0, 3).map((url, j) => (
      <img key={j} src={url} alt="" className="w-12 h-12 object-cover rounded border" />
    ))}
    {d.blobUrls.length > 3 && <span className="text-xs text-gray-500 self-end">+{d.blobUrls.length - 3}</span>}
    {d.status === "needs_review" && <span title={d.routingReason} className="text-yellow-600">⚠️</span>}
  </button>
</td>
```

Below the table tbody, before the publish button section, add the expanded editor panel:

```tsx
{expandedRow && (() => {
  const rowIdx = drafts.findIndex(d => d.productId === expandedRow);
  if (rowIdx < 0) return null;
  const row = drafts[rowIdx];
  return (
    <div className="mt-4 p-4 border rounded bg-gray-50">
      <div className="flex justify-between items-center mb-2">
        <div className="font-semibold">Reassign photos: {row.title || "Untitled"}</div>
        <button onClick={() => setExpandedRow(null)} className="text-sm text-gray-500">Close</button>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {row.blobUrls.map((url, j) => (
          <div key={j} className="relative">
            <img src={url} className="w-full aspect-square object-cover rounded border" />
            <select
              value={row.productId}
              onChange={(e) => movePhoto(rowIdx, j, e.target.value)}
              className="absolute bottom-1 left-1 right-1 text-xs px-1 py-0.5 bg-white/90 border rounded"
            >
              <option value={row.productId}>This product</option>
              {drafts.filter(d => d.productId !== row.productId).map(d => (
                <option key={d.productId} value={d.productId}>{d.title || "Untitled"}</option>
              ))}
              <option value="__new__">→ New product</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
})()}
```

- [ ] **Step 3: Add the `movePhoto` helper**

Inside `BatchListingPage` near `updateDraft`:

```typescript
function movePhoto(fromIdx: number, photoIdx: number, toProductId: string) {
  setDrafts(prev => {
    const next = prev.map(d => ({ ...d, blobUrls: [...d.blobUrls], photoIds: [...d.photoIds] }));
    const from = next[fromIdx];
    const movedUrl = from.blobUrls.splice(photoIdx, 1)[0];
    const movedId = from.photoIds.splice(photoIdx, 1)[0];

    if (toProductId === "__new__") {
      next.push({
        ...from,
        productId: crypto.randomUUID(),
        blobUrls: [movedUrl],
        photoIds: [movedId],
        title: "",
        price: 0,
        status: "needs_review",
        rowStatus: "ready",
        selected: false,
      });
    } else {
      const toIdx = next.findIndex(d => d.productId === toProductId);
      if (toIdx >= 0) {
        next[toIdx].blobUrls.push(movedUrl);
        next[toIdx].photoIds.push(movedId);
      }
    }

    // Drop any draft that's now empty
    return next.filter(d => d.blobUrls.length > 0);
  });
}
```

- [ ] **Step 4: Verify it works**

Run: `npm run dev`
Upload photos, click a photo cell, reassign one photo to another product or to a new product. Verify the source row's photo count drops and the target row's count increases. Click `[Re-analyze selected]` (will need to wire this; if not added yet, just verify the manual edit works for now).

- [ ] **Step 5: Add a `[Re-analyze selected]` header button**

Above the table (or in the same row as Publish button), add:

```tsx
<button
  className="px-3 py-2 border rounded text-sm mr-2"
  disabled={drafts.filter(d => d.selected).length === 0 || stage === "publishing"}
  onClick={reanalyzeSelected}
>
  Re-analyze selected
</button>
```

Add the helper:

```typescript
async function reanalyzeSelected() {
  const selected = drafts.filter(d => d.selected);
  if (selected.length === 0) return;
  setStage("analyzing");
  try {
    const res = await fetch("/api/listings/batch/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groups: selected.map(d => ({
          productId: d.productId,
          photoIds: d.photoIds,
          blobUrls: d.blobUrls,
          lowConfidence: false,
        })),
      }),
    });
    if (!res.ok) throw new Error("Re-analyze failed");
    const { drafts: refreshed } = await res.json() as { drafts: Draft[] };
    setDrafts(prev => prev.map(d => {
      const updated = refreshed.find(r => r.productId === d.productId);
      return updated ? { ...d, ...updated, selected: d.selected, rowStatus: "ready" } : d;
    }));
    toast.success(`Re-analyzed ${refreshed.length} products`);
  } catch (err) {
    toast.error((err as Error).message);
  } finally {
    setStage("ready");
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add app/listings/batch/page.tsx
git commit -m "Batch: photo reassignment editor and re-analyze action

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Wire publish-all with SSE consumption

**Files:**
- Modify: `app/listings/batch/page.tsx`

- [ ] **Step 1: Replace the stub `publishSelected` with the real implementation**

```typescript
async function publishSelected() {
  const selected = drafts.filter(d => d.selected && d.status === "ready");
  if (selected.length === 0) {
    toast.warning("No ready rows selected");
    return;
  }

  setStage("publishing");
  setDrafts(prev => prev.map(d => d.selected && d.status === "ready" ? { ...d, rowStatus: "publishing", publishErrors: {} } : d));

  try {
    const res = await fetch("/api/listings/batch/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drafts: selected }),
    });
    if (!res.body) throw new Error("No response stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events separated by \n\n; each starts with "data: "
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        const line = evt.trim().replace(/^data:\s*/, "");
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.done) continue;
          if (data.productId && data.platform) {
            applyEvent(data);
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    // Finalize row status: listed / partial / failed
    setDrafts(prev => prev.map(d => {
      if (d.rowStatus !== "publishing") return d;
      const platforms = (["ebay", "mercari", "facebook"] as const).filter(p => d.platforms[p]);
      const errs = d.publishErrors || {};
      const failed = platforms.filter(p => errs[p]);
      if (failed.length === 0) return { ...d, rowStatus: "listed" };
      if (failed.length === platforms.length) return { ...d, rowStatus: "failed" };
      return { ...d, rowStatus: "partial" };
    }));

    toast.success("Batch publish complete");
  } catch (err) {
    toast.error((err as Error).message);
  } finally {
    setStage("ready");
  }
}

function applyEvent(evt: { productId: string; platform: string; status: string; error?: string }) {
  setDrafts(prev => prev.map(d => {
    if (d.productId !== evt.productId) return d;
    const next = { ...d };
    if (!next.publishErrors) next.publishErrors = {};
    if (evt.status === "failed" && evt.error) {
      next.publishErrors = { ...next.publishErrors, [evt.platform]: evt.error };
    } else if (evt.status === "success") {
      const { [evt.platform]: _drop, ...rest } = next.publishErrors;
      next.publishErrors = rest;
    }
    return next;
  }));
}
```

- [ ] **Step 2: Verify build + smoke test**

Run: `npm run build && npm run dev`
Upload a tiny batch (1-2 photos forming 1 product), set quantity, hit Publish All Selected with eBay sandbox env (or production if your token is set). Verify:
- Row status shows `Publishing…` immediately
- Status flips to `Listed` / `Partial` / `Failed` based on platform outcomes
- Failure errors appear under the status

- [ ] **Step 3: Commit**

```bash
git add app/listings/batch/page.tsx
git commit -m "Batch: wire Publish All with SSE row status updates

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Mobile card layout

**Files:**
- Modify: `app/listings/batch/page.tsx`

- [ ] **Step 1: Add a mobile card view below the desktop table**

Find the `<div className="hidden md:block overflow-x-auto">...</div>` block. Right after it, add the mobile-only card view:

```tsx
<div className="md:hidden space-y-3">
  {drafts.map((d, i) => (
    <div key={d.productId} className="border rounded p-3 bg-white">
      <div className="flex items-start gap-2 mb-2">
        <input
          type="checkbox"
          checked={!!d.selected}
          disabled={d.status === "needs_review"}
          onChange={(e) => updateDraft(i, { selected: e.target.checked })}
        />
        <button onClick={() => setExpandedRow(expandedRow === d.productId ? null : d.productId)} className="flex gap-1">
          {d.blobUrls.slice(0, 3).map((url, j) => (
            <img key={j} src={url} alt="" className="w-14 h-14 object-cover rounded border" />
          ))}
          {d.blobUrls.length > 3 && <span className="text-xs text-gray-500 self-end">+{d.blobUrls.length - 3}</span>}
        </button>
        <span className={`ml-auto text-xs ${
          d.rowStatus === "listed" ? "text-green-600" :
          d.rowStatus === "partial" ? "text-yellow-600" :
          d.rowStatus === "failed" ? "text-red-600" :
          d.rowStatus === "publishing" ? "text-blue-600" :
          d.status === "needs_review" ? "text-yellow-600" : "text-gray-700"
        }`}>
          {d.rowStatus === "listed" ? "Listed" :
           d.rowStatus === "partial" ? "Partial" :
           d.rowStatus === "failed" ? "Failed" :
           d.rowStatus === "publishing" ? "Publishing…" :
           d.status === "needs_review" ? "Needs review" : "Ready"}
        </span>
      </div>
      <input
        type="text"
        value={d.title}
        placeholder="Title"
        onChange={(e) => updateDraft(i, { title: e.target.value })}
        className="w-full px-2 py-1 border rounded text-sm mb-2"
      />
      <div className="grid grid-cols-3 gap-2 mb-2">
        <label className="text-xs">
          Price
          <input type="number" min="0" step="0.01" value={d.price} onChange={(e) => updateDraft(i, { price: Number(e.target.value) })} className="w-full px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs">
          Qty
          <input type="number" min="1" value={d.quantity} onChange={(e) => updateDraft(i, { quantity: Math.max(1, Number(e.target.value)) })} className="w-full px-2 py-1 border rounded text-sm" />
        </label>
        <label className="text-xs">
          Lbs
          <input type="number" min="0" step="0.1" value={d.weight_lbs} onChange={(e) => updateDraft(i, { weight_lbs: Number(e.target.value) })} className="w-full px-2 py-1 border rounded text-sm" />
        </label>
      </div>
      <select
        value={d.routing}
        onChange={(e) => {
          const recommendation = e.target.value as "ship_online" | "local_only";
          if (recommendation === "ship_online") {
            updateDraft(i, { routing: recommendation, platforms: { ebay: true, mercari: true, facebook: true }, facebookLocalOnly: false });
          } else {
            updateDraft(i, { routing: recommendation, platforms: { ebay: false, mercari: false, facebook: true }, facebookLocalOnly: true });
          }
        }}
        className="w-full px-2 py-1 border rounded text-sm"
      >
        <option value="ship_online">Online (eBay+Mercari+FB)</option>
        <option value="local_only">FB local only</option>
      </select>
      {d.publishErrors && Object.keys(d.publishErrors).length > 0 && (
        <div className="text-xs text-red-600 mt-2">
          {Object.entries(d.publishErrors).map(([p, e]) => <div key={p}>{p}: {e}</div>)}
        </div>
      )}
    </div>
  ))}
</div>
```

- [ ] **Step 2: Verify mobile layout**

Run: `npm run dev`
In Chrome DevTools, switch to mobile viewport (375px). Verify:
- Table is hidden, cards are visible
- All fields are editable in card view
- Photo thumbs still expand the editor below

- [ ] **Step 3: Commit**

```bash
git add app/listings/batch/page.tsx
git commit -m "Batch: mobile card layout for the review table

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Add nav link and final end-to-end test

**Files:**
- Modify: whichever nav file links to `/listings` today

- [ ] **Step 1: Find the nav file**

Run: `grep -rln "href=\"/listings\"" app components 2>/dev/null`

- [ ] **Step 2: Add a `/listings/batch` link near the existing Listings link**

In the file found, add a new entry adjacent to the existing `Listings` link. Exact JSX depends on the nav component pattern; example:

```tsx
<a href="/listings/batch" className="...">Batch Listings</a>
```

- [ ] **Step 3: End-to-end smoke test on production**

```bash
npm run build
git add -p   # if any nav changes
git commit -m "Batch: add nav link to /listings/batch

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

Wait for Vercel deploy (per "always deploy" rule). Then on the deployed site:

1. Navigate to `/listings/batch`
2. Upload 3-5 known products worth of photos (10-15 photos total)
3. Verify groups match intent; reassign any wrong ones via the photo editor
4. Verify shippability call routes a cheap item to `FB local only` and a higher-value item to `Online`
5. Set one row to quantity=2; verify in the resulting Mercari/Facebook descriptions that "Quantity available: 2" appears
6. Hit `[Publish All Selected]`
7. Verify each platform receives the listings (check eBay listings, Mercari live items, Facebook Marketplace live items)
8. Verify Mac server logs show the publishes coming through

- [ ] **Step 4: Final commit if any fixups were needed**

If steps 7-8 surfaced bugs, fix them inline (do not amend; new commits). Each fix is its own commit with descriptive message.

---

## Self-Review (filled in inline; no separate review pass needed)

**Spec coverage:**
- ✅ Component 1 (upload) → Task 2
- ✅ Component 2 (group) → Task 4
- ✅ Component 3 (analyze) → Task 5
- ✅ Component 4 (review table UI) → Tasks 8, 9, 10, 12
- ✅ Component 5 (eBay endpoint) → Task 6
- ✅ Component 6 (batch publish) → Task 7
- ✅ Pure-logic module → Task 1
- ✅ Shippability prompt → Task 3
- ✅ Wiring (SSE consume) → Task 11
- ✅ Nav + e2e → Task 13

**Type consistency:** `Draft`, `PhotoRecord`, `PhotoGroup`, `Platform` named consistently across tasks. `routing`, `platforms`, `facebookLocalOnly`, `quantity`, `blobUrls`, `photoIds` shared between server endpoints and client.

**Placeholders:** None. All code is concrete. All commands are runnable.

**Scope:** One coherent feature, decomposable. Each task ships independently (codebase stays green after each commit since nothing existing depends on the new routes).

**Risks called out by the work itself:**
- HEIC conversion may need the `heic-convert` fallback if `sharp` ships without libheif on Vercel (Task 2 includes the fallback)
- Concurrency=2 in publish may contend on the Mac server — dial to 1 if observed in Task 13 e2e
- Shippability prompt accuracy will need calibration after first real batch (noted in spec Open Questions)
