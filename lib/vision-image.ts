// Route a public photo URL through the Next image optimizer so AI vision calls
// fetch a downscaled, recompressed copy instead of the full-res original. Image
// input tokens are the main driver of Anthropic API cost, and the vision model
// already caps images at ~1568px — sending a ~1080px copy roughly halves the
// tokens per image with no quality loss for grouping/titling.
//
// Only Vercel Blob URLs are rewritten (they're allowlisted in next.config's
// images.remotePatterns). Anything else passes through unchanged, and if no
// baseUrl is available we return the original URL so vision still works.
export function visionImageUrl(
  url: string,
  baseUrl: string,
  width = 1080,
  quality = 68
): string {
  if (!url || !baseUrl) return url;
  if (!/\.public\.blob\.vercel-storage\.com\//.test(url)) return url;
  return `${baseUrl}/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

// Per-item image cap for vision calls. A few angles are enough to title, price,
// and categorize an item; sending every photo just multiplies input tokens.
export const VISION_MAX_IMAGES = 4;
