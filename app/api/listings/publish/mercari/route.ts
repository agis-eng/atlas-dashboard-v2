import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft, MarketplaceConnection } from "@/lib/redis";
import { firecrawlScrape, firecrawlInteract, MERCARI_PROFILE } from "@/lib/firecrawl";
import { MERCARI_PROMPTS } from "@/lib/marketplace-prompts";

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId, scrapeId: existingScrapeId, step } = await request.json();

    if (!listingId || !step) {
      return Response.json({ error: "listingId and step are required" }, { status: 400 });
    }

    // Load listing from Redis
    const redis = getRedis();
    const listingsRaw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = listingsRaw
      ? (typeof listingsRaw === "string" ? JSON.parse(listingsRaw) : listingsRaw)
      : [];
    const listing = listings.find((l) => l.id === listingId);

    if (!listing) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    if (!listing.title || !listing.price) {
      return Response.json({ error: "Title and price are required" }, { status: 400 });
    }

    // Check Mercari connection
    const connRaw = await redis.get(REDIS_KEYS.marketplaceConnection("mercari"));
    const connection: MarketplaceConnection | null = connRaw
      ? (typeof connRaw === "string" ? JSON.parse(connRaw) : connRaw)
      : null;
    if (!connection?.connected) {
      return Response.json({ error: "Mercari account not connected. Connect it first." }, { status: 400 });
    }

    const listingInfo = {
      title: listing.title,
      description: listing.description,
      price: listing.price!,
      condition: listing.condition,
      category: listing.category,
      photos: listing.photos,
    };

    // Step-based execution to stay under 60s per request
    switch (step) {
      case "start": {
        // Navigate to sell page with persistent profile
        const result = await firecrawlScrape("https://www.mercari.com/sell/", {
          profile: MERCARI_PROFILE,
          proxy: "stealth",
          waitFor: 5000,
          formats: ["markdown"],
        });

        console.log("Mercari scrape result:", JSON.stringify({ success: result.success, scrapeId: result.data?.metadata?.scrapeId, error: result.error, url: result.data?.metadata?.url }));

        if (!result.success || !result.data?.metadata?.scrapeId) {
          return Response.json(
            { error: "Failed to open Mercari sell page", details: result.error || JSON.stringify(result) },
            { status: 500 }
          );
        }

        // Update listing status
        await updateListingField(redis, listings, listingId, { mercariStatus: "publishing" });

        return Response.json({
          success: true,
          scrapeId: result.data.metadata.scrapeId,
          step: "start",
          next: "fill",
        });
      }

      case "fill": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        const result = await firecrawlInteract(
          existingScrapeId,
          MERCARI_PROMPTS.fillBasicFields(listingInfo),
          { timeout: 45 }
        );

        if (!result.success) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Failed to fill listing fields",
          });
          return Response.json({ error: "Failed to fill fields", details: result.error }, { status: 500 });
        }

        return Response.json({
          success: true,
          scrapeId: existingScrapeId,
          step: "fill",
          next: "photos",
          output: result.data?.output,
        });
      }

      case "photos": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        const result = await firecrawlInteract(
          existingScrapeId,
          MERCARI_PROMPTS.uploadPhotos(listing.photos),
          { timeout: 55 }
        );

        if (!result.success) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Failed to upload photos",
          });
          return Response.json({ error: "Failed to upload photos", details: result.error }, { status: 500 });
        }

        return Response.json({
          success: true,
          scrapeId: existingScrapeId,
          step: "photos",
          next: "category",
          output: result.data?.output,
        });
      }

      case "category": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        const result = await firecrawlInteract(
          existingScrapeId,
          MERCARI_PROMPTS.setCategoryAndCondition(listingInfo),
          { timeout: 45 }
        );

        if (!result.success) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Failed to set category/condition",
          });
          return Response.json({ error: "Failed to set category", details: result.error }, { status: 500 });
        }

        return Response.json({
          success: true,
          scrapeId: existingScrapeId,
          step: "category",
          next: "submit",
          output: result.data?.output,
        });
      }

      case "submit": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        // Submit the listing
        const submitResult = await firecrawlInteract(
          existingScrapeId,
          MERCARI_PROMPTS.submitListing,
          { timeout: 45 }
        );

        if (!submitResult.success) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Failed to submit listing",
          });
          return Response.json({ error: "Failed to submit", details: submitResult.error }, { status: 500 });
        }

        // Try to get the listing URL
        const urlResult = await firecrawlInteract(
          existingScrapeId,
          MERCARI_PROMPTS.getListingUrl,
          { timeout: 30 }
        );

        const listingUrl = extractUrl(urlResult.data?.output || "");

        await updateListingField(redis, listings, listingId, {
          mercariStatus: "listed",
          mercariListingUrl: listingUrl || undefined,
          status: "listed",
        });

        return Response.json({
          success: true,
          step: "submit",
          listingUrl,
          output: submitResult.data?.output,
        });
      }

      default:
        return Response.json({ error: "Invalid step" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Mercari publish error:", error);
    return Response.json(
      { error: "Failed to publish to Mercari", details: error.message },
      { status: 500 }
    );
  }
}

async function updateListingField(
  redis: ReturnType<typeof getRedis>,
  listings: ListingDraft[],
  listingId: string,
  updates: Partial<ListingDraft>
) {
  const updated = listings.map((l) =>
    l.id === listingId ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
  );
  await redis.set(REDIS_KEYS.listings, JSON.stringify(updated));
}

function extractUrl(output: string): string | null {
  const match = output.match(/https?:\/\/[^\s"'<>]+mercari[^\s"'<>]*/i);
  return match?.[0] || null;
}
