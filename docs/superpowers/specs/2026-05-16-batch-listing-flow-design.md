# Batch Listing Flow — Design

**Date:** 2026-05-16
**Status:** Approved, pending implementation plan
**Owner:** Erik

## Goal

Take a folder of unsorted product photos (currently ~50 HEIC files in `Atlas/Products/`) and turn them into published marketplace listings with one review pass — instead of doing each listing one at a time through the existing per-item UI.

## Scope

**In scope (v1):**
- Batch ingest from `Atlas/Products/` Google Drive folder
- Auto-group photos into products using EXIF timestamps + vision sanity check
- Per-product AI analysis (reuse existing `/api/listings/analyze`)
- AI-judged shippability routing (ship online vs. Facebook local only)
- Single editable review table for the whole batch
- Concurrency-throttled batch publish across eBay, Mercari, Facebook
- Quantity > 1 support
- Drive folder lifecycle (move photos to `_listed/` after publish)

**Out of scope (v1):**
- Auto-relist after a sale
- Inventory sync across platforms
- iOS Shortcut for phone upload (the Drive app is sufficient)
- Re-photographing or photo editing inside the dashboard

## Existing infrastructure (reused unchanged)

- `app/api/listings/analyze` — per-item AI analysis (title, description, condition, price, category)
- `app/api/listings/publish/{ebay,mercari,facebook}` — per-platform publish endpoints
- Mac Playwright server at `~/.openclaw/workspace/mercari-server/` reached via Cloudflare tunnel — drives Mercari + Facebook
- eBay API integration
- `facebookLocalOnly` flag already wired in `app/listings/page.tsx`
- "Publish to All" pattern (recent commits show it's debugged and working)

## Architecture

```
Drive: Atlas/Products/                Dashboard: /listings/batch
  IMG_2200.HEIC  ─┐                   ┌──────────────────────────┐
  IMG_2201.HEIC   │                   │ [Scan Atlas/Products]    │
  IMG_2202.HEIC   ├──► POST /scan ───►│                          │
  IMG_2203.HEIC   │                   │ Review table:            │
  ...            ─┘                   │  ☑ Product A  $25 ...    │ ← edit inline
                                      │  ☑ Product B  $8  ...    │
                                      │  ☑ Product C  $40 ...    │
                                      │ [Publish All Selected]   │
                                      └──────────────┬───────────┘
                                                     │
                                     POST /publish-batch
                                                     │
                                                     ▼
                              For each row, fan out to existing:
                              /api/listings/publish/{ebay,mercari,facebook}
                              (which already call the Mac Playwright server)
```

**New surface area:**
- One page: `app/listings/batch/page.tsx`
- Three endpoints:
  - `POST /api/listings/batch/scan`
  - `POST /api/listings/batch/analyze`
  - `POST /api/listings/batch/publish` (Server-Sent Events for live row status)

## Component 1 — Scan endpoint (`POST /api/listings/batch/scan`)

**Purpose:** Read `Atlas/Products/` from Drive, group photos by product, return draft groups.

**Algorithm — two passes:**

**Pass 1: EXIF timestamp clustering (deterministic, no AI cost)**
- List all image files in `Atlas/Products/` via Drive MCP (recursive=false; ignore `_listed/` subfolder)
- Read EXIF `DateTimeOriginal` from each
- Sort chronologically
- Split into groups when the gap between consecutive photos exceeds the configured threshold (default: `90` seconds, configurable via `BATCH_GROUP_GAP_SECONDS` env var)
- For photos with no EXIF timestamp: fall back to filename sort order and flag the group as low-confidence

**Pass 2: Vision sanity check (one GPT-4o-mini call per candidate group)**
- For each candidate group, send the photos with the prompt:
  > "Do all these photos show the same physical item? Answer with strict JSON: `{verdict: 'yes' | 'split' | 'merge_previous', splitInto?: number[][]}`."
- `yes` → keep group as-is
- `split` → apply the AI's photo-index split
- `merge_previous` → merge with previous group

**HEIC handling:** Convert HEIC → JPEG previews server-side using `sharp` with libheif. Originals stay in Drive untouched. Previews stored in Vercel Blob (same pattern as Brain docs) and referenced by URL in the response.

**Response shape:**
```ts
{
  groups: Array<{
    productId: string;          // uuid
    photoPaths: string[];       // Drive file IDs
    previewUrls: string[];      // Vercel Blob URLs (JPEG)
    lowConfidence: boolean;     // true if EXIF missing or AI flagged
    confidenceReason?: string;  // surfaced in UI tooltip
  }>;
  scannedCount: number;
  skippedCount: number;         // HEIC decode failures, etc.
  skippedReasons: string[];
}
```

## Component 2 — Analyze endpoint (`POST /api/listings/batch/analyze`)

**Purpose:** For each product group, generate the full listing draft and the shippability routing decision.

**Per-group flow:**
1. Call existing `/api/listings/analyze` with the group's previews → returns title, description, condition, price, weight estimate, dimensions, category
2. Call new shippability prompt (single GPT-4o-mini call):
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
3. Apply routing rule:
   - `ship_online` → `platforms: { ebay: true, mercari: true, facebook: true }`, `facebookLocalOnly: false`
   - `local_only` → `platforms: { ebay: false, mercari: false, facebook: true }`, `facebookLocalOnly: true`

**Draft shape (one per row):**
```ts
{
  productId: string;
  photoPaths: string[];
  previewUrls: string[];
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

Rows are `needs_review` if title/price is missing, group was low-confidence, or AI failed.

## Component 3 — Review table UI (`app/listings/batch/page.tsx`)

Single full-width table. Each row = one product. All cells inline-editable.

**Columns:** ☑ select | Photos (thumbs) | Title | Price | Qty | Lbs | Routing dropdown | Status

**Editable cells:** title, price, qty, lbs, routing dropdown.

**Routing dropdown options:**
- `Online (eBay + Mercari + FB)`
- `FB local only`
- `Custom…` — popover with three platform checkboxes + `facebookLocalOnly` toggle

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
- `[Scan Atlas/Products]` — initial load (calls scan + analyze sequentially)
- `[Re-analyze selected]` — re-run AI on edited rows (cheap; respects current photo grouping)
- `[Publish All Selected (N)]` — fires batch publish; disabled if any selected row is `needs_review`

**Mobile:** Below 768px, the table stacks vertically as cards (one product per card). The table is the primary listing-from-phone surface, so mobile must work.

## Component 4 — Batch publish endpoint (`POST /api/listings/batch/publish`)

**Input:** Array of approved row drafts (the table's current state — server doesn't trust its own cache).

**Concurrency: 2 rows in flight at a time.** This pipelines the Mac server's persistent Chromium contexts (per-platform) without ever sharing one across two concurrent publishes.

**Per-row fan-out:** For each row, call eligible platform endpoints in parallel via `Promise.allSettled`:
- `platforms.ebay` → `POST /api/listings/publish/ebay` with `{ ...draft, quantity: row.quantity }`
- `platforms.mercari` → `POST /api/listings/publish/mercari` with `{ ...draft, description: appendQty(draft.description, row.quantity) }`
- `platforms.facebook` → `POST /api/listings/publish/facebook` with `{ ...draft, description: appendQty(...), facebookLocalOnly: row.facebookLocalOnly }`

**`appendQty(desc, qty)`** appends `\n\nQuantity available: ${qty}` when `qty > 1`, otherwise returns `desc` unchanged.

**Response:** Server-Sent Events stream. Each event:
```ts
{ productId, platform: "ebay"|"mercari"|"facebook", status: "started"|"success"|"failed", error?: string }
```

The UI consumes the stream and updates row status live, no polling.

**Idempotency:** Trust the existing per-platform endpoints' duplicate prevention (commit `ab40abc`). The orchestrator is a thin fan-out.

**Drive lifecycle on success:**
- When a row reaches `Listed` OR `Partial` (≥1 platform succeeded), move its source photos from `Atlas/Products/` to `Atlas/Products/_listed/<sku>-<YYYY-MM-DD>/` via Drive MCP
- `<sku>` is `${slug(title)}-${productId.slice(0,8)}`
- Failed-everywhere rows: photos stay in `Atlas/Products/` for re-scanning

## Edge cases

| Case | Handling |
|---|---|
| Empty `Atlas/Products/` | "No photos to scan" empty state |
| Photo with no EXIF | Fallback to filename sort; flag group ⚠️ |
| Everything within 90s | Trust EXIF; vision pass-2 splits |
| HEIC decode failure | Skip photo, surface in `skippedReasons`, continue |
| Drive auth expired | "Reconnect Drive" CTA, no crash |
| Mac server offline | Row stays `Ready`, toast: "Mac server unreachable" |
| Single platform fails on a row | Row → `Partial`, others still complete |
| Vision call fails | Group keeps EXIF-only grouping, flag ⚠️ |
| Re-scan after partial publish | `_listed/` subfolder excluded, so already-published items aren't re-shown |

## Testing

**Manual end-to-end first.** Scan the real `Atlas/Products/` folder. Walk the table. Publish 1-2 rows. Verify each lands on its intended platforms.

**Unit tests** for the two pure-logic pieces that are easy to regress:
- EXIF grouping: given an array of timestamps + threshold → returns expected groups (cover: typical, all-same-second, gaps shorter than threshold, gaps longer)
- Shippability routing rule: given AI recommendation → returns expected `platforms` + `facebookLocalOnly` (cover: ship_online, local_only)

No tests for the orchestrator beyond the manual run — the per-platform endpoints are already exercised by the existing per-listing flow.

## Cost & deployment

- Vision pass-2: ~50 calls × $0.001 ≈ $0.05 per batch
- Shippability prompt: ~50 calls × $0.001 ≈ $0.05 per batch
- Analyze endpoint already costed in current flow

Per the project's "always deploy" rule, each PR commits to main → Vercel auto-deploys. New routes (`/listings/batch`, `/api/listings/batch/*`) live behind nothing; partial versions just don't appear in the nav until done.

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
