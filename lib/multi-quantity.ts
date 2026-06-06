import type { ListingDraft } from "@/lib/redis";

// Facebook Marketplace and Craigslist have no "quantity" field, so when a
// listing has more than one unit we surface the count in the title and
// description. eBay and Mercari use their own quantity fields, so this is only
// applied on the FB/CL publish paths.
//
// If a count is already present (e.g. the seller typed "5 available" by hand),
// we leave it alone to avoid duplicating it.
const ALREADY_HAS_COUNT = /\b\d+\s*available\b/i;

export function withQuantityNote<T extends ListingDraft>(listing: T): T {
  const qty = Number(listing.quantity) || 1;
  if (qty <= 1) return listing;

  let title = (listing.title || "").trim();
  let description = listing.description || "";

  if (title && !ALREADY_HAS_COUNT.test(title)) {
    title = `${title} (${qty} available)`;
  }
  if (!ALREADY_HAS_COUNT.test(description)) {
    description = description.trim()
      ? `${description.trim()}\n\n${qty} available.`
      : `${qty} available.`;
  }

  return { ...listing, title, description };
}
