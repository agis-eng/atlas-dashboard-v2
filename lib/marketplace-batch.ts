// Pure functions for batch listing. No I/O. Factored so they can be tested
// in isolation later (e.g. `node --test`) without spinning up the framework.

import { randomUUID } from "crypto";

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

/**
 * Cluster photos by EXIF timestamp. Photos within `gapSeconds` of each other
 * stay in the same group up to `maxGroupSize` photos; a larger gap OR reaching
 * maxGroupSize starts a new group. Capping at maxGroupSize ensures the vision
 * pass sees all photos (not just the first 6 of a massive cluster).
 * Photos with `exifTimestampMs === null` go into their own low-confidence tail group.
 */
export function groupByExifGap(
  photos: PhotoRecord[],
  gapSeconds: number = 90,
  maxGroupSize: number = 6
): PhotoGroup[] {
  const withTime = photos.filter(p => p.exifTimestampMs !== null)
    .sort((a, b) => (a.exifTimestampMs! - b.exifTimestampMs!));
  const withoutTime = photos.filter(p => p.exifTimestampMs === null);

  const groups: PhotoGroup[] = [];
  const gapMs = gapSeconds * 1000;
  let lastTime: number | null = null;

  for (const photo of withTime) {
    const last = groups[groups.length - 1];
    const withinGap = last && lastTime !== null && (photo.exifTimestampMs! - lastTime) <= gapMs;
    const groupNotFull = last && last.photoIds.length < maxGroupSize;

    if (withinGap && groupNotFull) {
      last.photoIds.push(photo.photoId);
      last.blobUrls.push(photo.blobUrl);
    } else {
      groups.push({
        productId: randomUUID(),
        photoIds: [photo.photoId],
        blobUrls: [photo.blobUrl],
        lowConfidence: false,
      });
    }
    lastTime = photo.exifTimestampMs;
  }

  // Chunk no-EXIF photos into groups of maxGroupSize as well so they also
  // get vision-checked rather than landing in one giant low-confidence blob.
  for (let i = 0; i < withoutTime.length; i += maxGroupSize) {
    const chunk = withoutTime.slice(i, i + maxGroupSize);
    groups.push({
      productId: randomUUID(),
      photoIds: chunk.map(p => p.photoId),
      blobUrls: chunk.map(p => p.blobUrl),
      lowConfidence: true,
      confidenceReason: "No EXIF timestamps",
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
