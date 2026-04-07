import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft, MarketplaceConnection } from "@/lib/redis";
import { firecrawlScrape, firecrawlInteract, firecrawlInteractCode, MERCARI_PROFILE } from "@/lib/firecrawl";

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

    const connRaw = await redis.get(REDIS_KEYS.marketplaceConnection("mercari"));
    const connection: MarketplaceConnection | null = connRaw
      ? (typeof connRaw === "string" ? JSON.parse(connRaw) : connRaw)
      : null;
    if (!connection?.connected) {
      return Response.json({ error: "Mercari account not connected. Connect it first." }, { status: 400 });
    }

    switch (step) {
      case "start": {
        const result = await firecrawlScrape("https://www.mercari.com/sell/", {
          profile: MERCARI_PROFILE,
          proxy: "enhanced",
          waitFor: 5000,
          formats: ["markdown"],
        });

        console.log("Mercari raw response:", JSON.stringify(result).substring(0, 500));
        const scrapeId = result.data?.metadata?.scrapeId || (result as any).metadata?.scrapeId || (result as any).scrapeId;
        console.log("Mercari start - scrapeId:", scrapeId);

        if (!scrapeId) {
          return Response.json(
            { error: "Failed to open Mercari sell page", details: result.error || "No scrapeId" },
            { status: 500 }
          );
        }

        // Check if we're on the sell page or got redirected to login
        const pageContent = result.data?.markdown || "";
        if (pageContent.includes("Log in to Mercari") || pageContent.includes("Sign up")) {
          return Response.json(
            { error: "Mercari session expired. Please reconnect your account." },
            { status: 401 }
          );
        }

        await updateListingField(redis, listings, listingId, { mercariStatus: "publishing" });

        return Response.json({
          success: true,
          scrapeId,
          step: "start",
          next: "fill",
        });
      }

      case "fill": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        // Use code-based interact to fill form fields via JavaScript
        const title = listing.title.replace(/'/g, "\\'").replace(/\n/g, " ");
        const desc = listing.description.replace(/'/g, "\\'").replace(/\n/g, "\\n");
        const price = listing.price!;

        const fillResult = await firecrawlInteractCode(
          existingScrapeId,
          `agent-browser type "input[name='name'], input[placeholder*='Title'], input[aria-label*='Title']" "${title}"`,
          { timeout: 30, language: "bash" }
        );
        console.log("Fill title result:", JSON.stringify(fillResult.data?.output || fillResult.error));

        // Try natural language as fallback — it's better at finding React form fields
        const nlResult = await firecrawlInteract(
          existingScrapeId,
          `On this Mercari "List an item" form page, do the following steps carefully:
1. Click on the Title input field and type exactly: ${listing.title}
2. Click on the Description textarea and type exactly: ${listing.description}
3. Click on "Ship on your own" under the Shipping section
4. Click on the "${listing.condition || "Good"}" condition option
5. Click on the price input field and type: ${price}
Do NOT click the List button. Just fill in these fields.`,
          { timeout: 50 }
        );
        console.log("Fill NL result:", JSON.stringify({ success: nlResult.success, output: nlResult.data?.output?.substring(0, 200), error: nlResult.error }));

        if (!nlResult.success && !fillResult.success) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Failed to fill listing fields",
          });
          return Response.json({ error: "Failed to fill fields", details: nlResult.error || fillResult.error }, { status: 500 });
        }

        return Response.json({
          success: true,
          scrapeId: existingScrapeId,
          step: "fill",
          next: "submit",
          output: nlResult.data?.output,
        });
      }

      case "submit": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        // Take a screenshot before submitting so we can see what was filled
        const screenshotResult = await firecrawlInteract(
          existingScrapeId,
          "Take a screenshot of the current page. Describe what you see - are the form fields filled in? What does the title say? What does the price say? Is there any error message?",
          { timeout: 30 }
        );
        console.log("Pre-submit check:", JSON.stringify({ output: screenshotResult.data?.output?.substring(0, 500) }));

        // Try to submit
        const submitResult = await firecrawlInteract(
          existingScrapeId,
          "Click the 'List' button at the bottom of the page to submit this listing. If there's an error or missing required fields, describe what the error says.",
          { timeout: 45 }
        );
        console.log("Submit result:", JSON.stringify({ success: submitResult.success, output: submitResult.data?.output?.substring(0, 500), error: submitResult.error }));

        // Check what happened after submit
        const checkResult = await firecrawlInteract(
          existingScrapeId,
          "What happened after clicking List? Is there a success message? A new URL? An error? Describe what you see on the screen now. If there's a listing URL, return it.",
          { timeout: 30 }
        );
        console.log("Post-submit check:", JSON.stringify({ output: checkResult.data?.output?.substring(0, 500) }));

        const output = checkResult.data?.output || submitResult.data?.output || "";
        const listingUrl = extractUrl(output);
        const hasError = output.toLowerCase().includes("error") || output.toLowerCase().includes("required") || output.toLowerCase().includes("missing");

        if (hasError && !listingUrl) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: output.substring(0, 200),
          });
          return Response.json({
            success: false,
            error: "Listing may not have been created",
            details: output.substring(0, 500),
          });
        }

        await updateListingField(redis, listings, listingId, {
          mercariStatus: "listed",
          mercariListingUrl: listingUrl || undefined,
          status: listingUrl ? "listed" : listing.status,
        });

        return Response.json({
          success: true,
          step: "submit",
          listingUrl,
          output: output.substring(0, 500),
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
