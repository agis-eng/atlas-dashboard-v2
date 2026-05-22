// Pure pricing-rule logic for the weekly auto-pricing job.
// Pulled out of the route handler so it can be unit-tested later
// (currently no test framework — keep functions pure).

export interface PriceReviewInput {
  /** ISO timestamp when the listing was first created in our system. */
  createdAt: string;
  /** Most recent listing price we have on record. */
  currentPrice: number;
  /** Original price at first publish — used as the "floor" reference. */
  originalPrice: number;
  /** Click count from Facebook's selling dashboard. */
  clicks: number;
  /** ISO timestamp of the last price change we made (so we don't drop twice in one week). */
  lastPriceChangeAt?: string;
}

export interface PriceReviewResult {
  /** True if the cron should issue a price update for this listing. */
  shouldDrop: boolean;
  /** New price if shouldDrop, else null. */
  newPrice: number | null;
  /** Human-readable explanation for the log and the listing note. */
  reason: string;
  /** Listing age in days (calculated at evaluation time). */
  ageDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Round a price to the nearest sensible whole-dollar marker. Facebook
 * Marketplace prices are integer dollars in practice; this also avoids
 * publishing "drop from $25 to $20.32" weirdness.
 */
function roundPrice(p: number): number {
  if (p <= 10) return Math.max(5, Math.round(p));
  if (p <= 50) return Math.round(p / 5) * 5; // nearest $5
  return Math.round(p / 10) * 10; // nearest $10
}

/**
 * Apply the price-review rules and return whether to drop and to what.
 *
 * Rules (per the user's spec on 2026-05-22):
 *   - First 14 days: never drop (give the listing room to breathe)
 *   - Days 15-28, clicks < 10: drop 20% (no real interest — too expensive)
 *   - Days 15-28, clicks ≥ 10: drop 10% (seen but not compelling)
 *   - Days 29+, drop another 15% (third price)
 *   - Don't drop twice in the same 7-day window
 *   - Floor: never go below $5 or 30% of original, whichever is HIGHER
 */
export function evaluatePriceDrop(
  input: PriceReviewInput,
  now: Date = new Date()
): PriceReviewResult {
  const ageDays = Math.floor((now.getTime() - new Date(input.createdAt).getTime()) / MS_PER_DAY);

  if (ageDays < 14) {
    return {
      shouldDrop: false,
      newPrice: null,
      reason: `Listed ${ageDays}d ago — under 14-day cool-off window`,
      ageDays,
    };
  }

  // Don't drop twice in 7 days.
  if (input.lastPriceChangeAt) {
    const daysSinceChange = Math.floor(
      (now.getTime() - new Date(input.lastPriceChangeAt).getTime()) / MS_PER_DAY
    );
    if (daysSinceChange < 7) {
      return {
        shouldDrop: false,
        newPrice: null,
        reason: `Price dropped ${daysSinceChange}d ago — 7-day cool-off`,
        ageDays,
      };
    }
  }

  let dropPct = 0;
  let reason = "";
  if (ageDays >= 29) {
    dropPct = 0.15;
    reason = `Day ${ageDays} third-stage drop (-15%)`;
  } else if (input.clicks < 10) {
    dropPct = 0.20;
    reason = `Day ${ageDays}, only ${input.clicks} clicks — drop 20% to attract interest`;
  } else {
    dropPct = 0.10;
    reason = `Day ${ageDays}, ${input.clicks} clicks but no sale — drop 10%`;
  }

  const proposed = input.currentPrice * (1 - dropPct);
  const floor = Math.max(5, Math.ceil(input.originalPrice * 0.30));
  const newPrice = roundPrice(Math.max(proposed, floor));

  if (newPrice >= input.currentPrice) {
    return {
      shouldDrop: false,
      newPrice: null,
      reason: `At floor ($${floor}) — no further drops possible`,
      ageDays,
    };
  }

  return {
    shouldDrop: true,
    newPrice,
    reason: `${reason} ($${input.currentPrice} → $${newPrice})`,
    ageDays,
  };
}
