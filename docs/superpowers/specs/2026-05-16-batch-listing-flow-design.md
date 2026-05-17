# Batch Listing Flow — Design

**Date:** 2026-05-16
**Status:** Approved (revised 2026-05-16 to use upload intake instead of Drive)
**Owner:** Erik

## Goal

Take a bulk batch of unsorted product photos (initial: ~50 HEIC files moved from phone to laptop, then uploaded) and turn them into published marketplace listings with one review pass — instead of doing each listing one at a time through the existing per-item UI.

## Scope

**In scope (v1):**
- Bulk multi-file upload (mobile-friendly) — photos land in Vercel Blob, EXIF preserved
- Auto-group photos into products using EXIF timestamps + vision sanity check
- Per-product AI analysis (reuse existing `/api/listings/analyze`)
- AI-judged shippability routing (ship online vs. Facebook local only)
- Single editable review table for the whole batch
- Concurrency-throttled batch publish across eBay, Mercari, Facebook
- Quantity > 1 support
- New `app/api/listings/publish/ebay/route.ts` server endpoint wrapping the existing 3-step inventory→offer→publish dance (so the batch orchestrator treats all 3 platforms uniformly)

**Out of scope (v1):**
- Google Drive integration as a photo source (would require OAuth + googleapis package — deferred to v2 if needed)
- Auto-relist after a sale
- Inventory sync across platforms
- Re-photographing or photo editing inside the dashboard

## Existing infrastructure (reused unchanged)

- `app/api/listings/analyze` — per-item AI analysis (title, description, condition, price, category) via Anthropic Claude vision
- `app/api/listings/upload` — single-listing Vercel Blob photo upload (the bulk uploader follows the same pattern)
- `app/api/listings/publish/{mercari,facebook}` — Mac-server proxy endpoints
- `app/api/ebay` — eBay API proxy (inventory, offer, publish actions called separately from the client today)
- Mac Playwright server at `~/.openclaw/workspace/mercari-server/` reached via Cloudflare tunnel — drives Mercari + Facebook publishes
- `facebookLocalOnly` flag already wired in `app/listings/page.tsx`
- `lib/redis.ts` for `ListingDraft` type and Redis helpers
- `lib/auth.ts` `getSessionUserFromRequest` for all new endpoints

## Architecture

```
Phone/Mac files                     Dashboard: /listings/batch
  IMG_2200.HEIC  ─┐                  ┌──────────────────────────┐
  IMG_2201.HEIC   │  multi-file      │ [Select photos to upload]│
  IMG_2202.HEIC   ├─── upload  ─────►│ Upload progress...       │
  IMG_2203.HEIC   │  (mobile)        │ → POST /batch/upload     │
  ...            ─┘                  │ → POST /batch/group      │
                                     │ → POST /batch/analyze    │
                                     │                          │
                                     │ Review table:            │
                                     │  ☑ Product A  $25 ...    │ ← edit inline
                                     │  ☑ Product B  $8  ...    │
                                     │  ☑ Product C  $40 ...    │
                                     │ [Publish All Selected]   │
                                     └──────────────┬───────────┘
                                                    │
                                    POST /batch/publish (SSE stream)
                                                    │
                                                    ▼
                            For each row, fan out to:
                            /api/listings/publish/{ebay,mercari,facebook}
                            (ebay route is new; mercari/facebook unchanged)
```

**New surface area:**
- One page: `app/listings/batch/page.tsx`
- Five endpoints:
  - `POST /api/listings/batch/upload` — multi-file upload + HEIC→JPEG + EXIF extract
  - `POST /api/listings/batch/group` — EXIF-cluster + vision sanity check
  - `POST /api/listings/batch/analyze` — per-group analyze + shippability decision
  - `POST /api/listings/batch/publish` — SSE-streaming orchestrator
  - `POST /api/listings/publish/ebay` — wraps the inventory→offer→publish dance
- One pure-logic module: `lib/marketplace-batch.ts` (EXIF grouping + routing rule, exported as pure functions)
- Shippability prompt added to `lib/marketplace-prompts.ts`

## Component 1 — Bulk upload endpoint (`POST /api/listings/batch/upload`)

**Purpose:** Accept multi-file form upload, convert HEIC→JPEG, extract EXIF timestamps, store in Vercel Blob, return photo records.

- Multipart form data: `photos[]` (1-100 files), `batchId` (uuid, generated client-side)
- For each file:
  - Validate type (HEIC / JPEG / PNG / WEBP only, ≤15 MB each)
  - If HEIC: convert to JPEG via `sharp` (Vercel supports `sharp` for Image Optimization; if libheif isn't bundled, fall back to `heic-convert` — verified during Task 1)
  - Extract EXIF `DateTimeOriginal` via `exifr` (lightweight, ~30kb, works on HEIC and JPEG)
  - Upload JPEG to Vercel Blob at `listings/batch/<batchId>/<idx>.jpg`
- Returns:
```ts
{
  batchId: string;
  photos: Array<{
    photoId: string;        // uuid
    blobUrl: string;
    originalName: string;
    exifTimestampMs: number | null;  // null if missing
    sizeBytes: number;
  }>;
  uploadedCount: number;
  skippedCount: number;
  skippedReasons: string[];
}
```

## Component 2 — Group endpoint (`POST /api/listings/batch/group`)

**Purpose:** Take uploaded photo records, group into products via EXIF clustering + vision sanity check.

**Pass 1: EXIF timestamp clustering (deterministic, no AI cost)**
- Sort photos by `exifTimestampMs` ascending (photos with `null` go to the end and form their own low-confidence group)
- Split into groups when the gap between consecutive photos exceeds the configured threshold (default: `90` seconds, configurable via `BATCH_GROUP_GAP_SECONDS` env var)
- Pure function `groupByExifGap(photos, gapSeconds)` lives in `lib/marketplace-batch.ts`

**Pass 2: Vision sanity check (one Claude vision call per candidate group)**
- Uses Claude (matches existing analyze) with prompt:
  > "Do all these photos show the same physical item? Reply strict JSON: `{verdict: 'yes' | 'split' | 'merge_previous', splitInto?: number[][]}`. `splitInto` is one inner array per resulting item, holding zero-based photo indices."
- `yes` → keep group as-is
- `split` → apply the AI's photo-index split
- `merge_previous` → merge with previous group
- Vision pass is best-effort: any failure leaves EXIF-only grouping and flags `lowConfidence: true`

**Request:**
```ts
{
  batchId: string;
  photos: Array<{ photoId: string; blobUrl: string; exifTimestampMs: number | null }>;
  gapSeconds?: number;  // override default 90
}
```

**Response:**
```ts
{
  groups: Array<{
    productId: string;          // uuid
    photoIds: string[];
    blobUrls: string[];
    lowConfidence: boolean;
    confidenceReason?: string;
  }>;
}
```

## Component 3 — Analyze endpoint (`POST /api/listings/batch/analyze`)

**Purpose:** For each product group, generate the full listing draft and the shippability routing decision.

**Per-group flow:**
1. Call existing `/api/listings/analyze` (via internal `fetch` to localhost or in-process function) with the group's blob URLs → returns title, description, condition, price, weight estimate, dimensions, category
2. Call new shippability prompt via Claude:
   ```
   Given:
     estimated_value_usd: number
     weight_lbs: number
     longest_side_in: number
     category: string

   Return strict JSON:
     estimated_shipping_cost_usd: number
     estimated_ebay_fees_usd: number
     estimated_mercari_fees_usd: number
     estimated_profit_if_shipped_usd: number
     recommendation: "ship_online" | "local_only"
     reason: string
   ```
3. Apply routing rule (pure function `applyRouting(recommendation)` in `lib/marketplace-batch.ts`):
   - `ship_online` → `platforms: { ebay: true, mercari: true, facebook: true }`, `facebookLocalOnly: false`
   - `local_only` → `platforms: { ebay: false, mercari: false, facebook: true }`, `facebookLocalOnly: true`

**Draft shape (one per row, returned in response.drafts):**
```ts
{
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
  quantity: number;             // defaults to 1
  routing: "ship_online" | "local_only";
  routingReason: string;        // shown in ⓘ tooltip
  estimatedProfit: number;
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
  status: "ready" | "needs_review";
}
```

Rows are `needs_review` if title/price missing, group was low-confidence, or AI call failed.

## Component 4 — Review table UI (`app/listings/batch/page.tsx`)

Single full-width table. Each row = one product. All cells inline-editable.

**Columns:** ☑ select | Photos (thumbs) | Title | Price | Qty | Lbs | Routing dropdown | Status

**Editable cells:** title, price, qty, lbs, routing dropdown.

**Routing dropdown options:**
- `Online (eBay + Mercari + FB)` → `routing="ship_online"`, all platforms checked, `facebookLocalOnly=false`
- `FB local only` → `routing="local_only"`, only `facebook` checked, `facebookLocalOnly=true`
- `Custom…` → opens popover with three platform checkboxes + `facebookLocalOnly` toggle

**Tooltips:**
- ⓘ on routing → shows `routingReason` and `estimatedProfit`
- ⚠️ on photos → "Low confidence grouping. Click to reassign photos."

**Photo reassignment:** Clicking the photo thumbs expands an inline editor showing all photos in the group with checkboxes to move them to another group (or create a new group from selected).

**Per-row status states:**
- `Ready` (green)
- `Needs review` (yellow)
- `Publishing… (eBay ✓ Mercari … FB pending)` during publish
- `Listed` (all selected platforms succeeded)
- `Partial (eBay ✓, Mercari ✗: <reason>)` (mixed result)
- `Failed` (all selected platforms failed)

**Header actions:**
- `[Upload photos]` — opens multi-file picker; runs upload → group → analyze in sequence with progress UI
- `[Re-analyze selected]` — re-runs analyze + shippability on selected rows with current photo grouping (does not re-upload)
- `[Publish All Selected (N)]` — fires batch publish; disabled if any selected row is `needs_review`

**Mobile:** Below 768px, the table stacks vertically as cards (one product per card). The table is the primary listing-from-phone surface, so mobile must work.

## Component 5 — eBay publish endpoint (`POST /api/listings/publish/ebay`)

**Purpose:** Wrap the existing 3-step inventory→offer→publish dance (currently done client-side in `app/listings/page.tsx`) into one server endpoint so the batch orchestrator can call all 3 platforms uniformly.

**Request:**
```ts
{
  listingId: string;
  env?: "sandbox" | "production";   // default production
  token?: string;                   // override; otherwise pulled from Redis
  draft: {                          // subset of the row draft
    title: string;
    description: string;
    price: number;
    quantity: number;
    condition: string;
    brand?: string;
    size?: string;
    sizeType?: string;
    photos: string[];               // blob URLs
  };
  sku: string;
}
```

**Server logic (port of the client-side dance at `app/listings/page.tsx:355-455`):**
1. Resolve token (param → Redis → env var)
2. POST `create-inventory-item` to `/api/ebay`
3. GET `categories` from `/api/ebay`
4. GET `policies` from `/api/ebay/policies`
5. POST `create-offer` to `/api/ebay`
6. POST `publish-offer` to `/api/ebay`
7. Return `{ ok: true, listingId, offerId, ebayListingId }` on success or `{ ok: false, error }` on failure

**Why a server endpoint vs. keeping it client-side:** Uniformity with mercari/facebook publish endpoints means the batch orchestrator has one fan-out shape, and the eBay logic gets exercised the same way from per-listing flow (which we'll migrate to call the new endpoint as a side cleanup).

## Component 6 — Batch publish endpoint (`POST /api/listings/batch/publish`)

**Input:** Array of approved row drafts (the table's current state).

**Concurrency:** 2 rows in flight at a time. This pipelines the Mac server's per-platform persistent Chromium contexts without ever sharing one across concurrent publishes.

**Per-row fan-out:** For each row, call eligible platform endpoints in parallel via `Promise.allSettled`:
- `platforms.ebay` → `POST /api/listings/publish/ebay` with `{ ...draft, quantity: row.quantity }`
- `platforms.mercari` → `POST /api/listings/publish/mercari` with `{ ...draft, description: appendQty(draft.description, row.quantity) }`
- `platforms.facebook` → `POST /api/listings/publish/facebook` with `{ ...draft, description: appendQty(...), facebookLocalOnly: row.facebookLocalOnly }`

**`appendQty(desc, qty)`** in `lib/marketplace-batch.ts` appends `\n\nQuantity available: ${qty}` when `qty > 1`, otherwise returns `desc` unchanged.

**Response:** Server-Sent Events stream. Each event JSON-encoded on a `data:` line:
```ts
{ productId, platform: "ebay"|"mercari"|"facebook", status: "started"|"success"|"failed", error?: string }
```

Plus a final event `{ done: true }` to signal stream closure.

The UI consumes the stream via `EventSource` (or `fetch` + `ReadableStream` reader) and updates row status live.

**Idempotency:** Trust the existing per-platform endpoints' duplicate prevention (commit `ab40abc`). The orchestrator is a thin fan-out.

## Edge cases

| Case | Handling |
|---|---|
| No photos selected for upload | Disabled button (client-side) |
| Photo with no EXIF | Goes to a "no-timestamp" group, flagged `lowConfidence: true` |
| Everything within 90s | One big group; vision pass-2 splits |
| HEIC decode failure | Skip photo, surface in `skippedReasons`, continue |
| Single file > 15 MB | Reject in upload endpoint with a per-file error in `skippedReasons` |
| Vision call fails | Group keeps EXIF-only grouping, `lowConfidence: true` |
| Mac server offline (mercari/facebook) | Row → `Partial` or `Failed`, error toast surfaces server URL missing |
| eBay token expired | eBay publish returns `{ ok: false, error: "token expired" }`; row marked `Failed` for eBay, others continue |
| Single platform fails on a row | Row → `Partial`, other platforms still complete |
| Repeat upload of same photos | Each upload gets a fresh `batchId`; duplicate detection is the user's responsibility for v1 |

## Testing

**Manual end-to-end is the primary verification path** — this codebase has no test framework installed and the spec does not justify adding one for v1.

To keep regressions cheap to find later, the two pure-logic pieces are factored into `lib/marketplace-batch.ts` as exported functions:
- `groupByExifGap(photos, gapSeconds)` → `Group[]`
- `applyRouting(recommendation)` → `{ platforms, facebookLocalOnly }`
- `appendQty(desc, qty)` → `string`

These can be tested with `node --test` (Node built-in test runner, no extra deps) if regressions appear. Not built in v1.

**Manual e2e test plan after final commit:**
1. Upload 3-5 known products' worth of photos (~10-15 files)
2. Verify groups match intent; reassign any wrong ones via the photo editor
3. Verify shippability call routes a cheap item to `FB local only` and a higher-value item to `Online`
4. Set one row to qty=2; verify the description appends "Quantity available: 2"
5. Publish all; verify each platform receives the listings (check eBay sandbox or production, Mercari live, Facebook live)

## Cost & deployment

- Vision pass-2 (group sanity): ~50 calls × ~$0.003 ≈ $0.15 per 50-photo batch (Claude Haiku vision)
- Shippability prompt: ~20 calls × ~$0.001 ≈ $0.02 per batch (Claude Haiku, text-only)
- Analyze endpoint already costed in current flow

Per the project's "always deploy" rule, each commit lands on main → Vercel auto-deploys. New routes (`/listings/batch`, `/api/listings/batch/*`, `/api/listings/publish/ebay`) live behind nothing; partial versions just don't appear in the nav until the page is added.

## Non-goals (explicit)

- Cross-platform inventory sync (qty decrement when one sells)
- Auto-relist when a listing expires
- A custom mobile-app or iOS Shortcut for photo upload
- Photo editing / cropping inside the dashboard
- Per-row scheduled publishing (everything publishes immediately on click)

## Open questions

None as of design approval. Tuning items to address during/after first real run:
- EXIF gap threshold (start 90s, adjust based on observed groupings)
- Shippability prompt accuracy (calibrate `reason` text and fee estimates after first batch)
- Mac server concurrency=2 may need to drop to 1 if Chromium contexts contend
