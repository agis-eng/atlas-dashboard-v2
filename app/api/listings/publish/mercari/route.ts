import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft, MarketplaceConnection } from "@/lib/redis";
import { firecrawlScrape, firecrawlInteract, firecrawlInteractStop, FirecrawlProfile } from "@/lib/firecrawl";

// Use saveChanges: false for publish — saveChanges: true locks the profile
const MERCARI_READ_PROFILE: FirecrawlProfile = { name: "mercari-session", saveChanges: false };

function getOutput(result: any): string {
  return result?.output || result?.data?.output || "";
}

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
          profile: MERCARI_READ_PROFILE,
          proxy: "enhanced",
          waitFor: 5000,
          formats: ["markdown"],
        });

        const scrapeId = result.data?.metadata?.scrapeId;
        console.log("Mercari start - scrapeId:", scrapeId, "status:", result.data?.metadata?.statusCode);

        if (!scrapeId) {
          console.log("Mercari no scrapeId. Full keys:", JSON.stringify(Object.keys(result)));
          return Response.json(
            { error: "Failed to open Mercari sell page", details: result.error || "No scrapeId" },
            { status: 500 }
          );
        }

        const pageContent = result.data?.markdown || "";
        if (pageContent.includes("Log in to Mercari")) {
          return Response.json(
            { error: "Mercari session expired. Please reconnect your account." },
            { status: 401 }
          );
        }

        await updateListingField(redis, listings, listingId, { mercariStatus: "publishing" });

        return Response.json({ success: true, scrapeId, step: "start", next: "fill" });
      }

      case "fill": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        const title = listing.title;
        const desc = listing.description;
        const price = listing.price!;
        const condition = listing.condition || "Good";

        // Fill all fields in one interact call
        const fillResult = await firecrawlInteract(
          existingScrapeId,
          `On this Mercari "List an item" form, do these steps in order:
1. Click the Title input field (textbox labeled "Title") and type exactly: ${title}
2. Click the Description textarea (textbox labeled "Description") and type exactly: ${desc}
3. Click on the "${condition}" condition option to select it
4. Click on "Ship on your own" under Shipping method (if not already selected)
5. Click the price input field (textbox with placeholder "min $1/max $2000") and type: ${price}
Do NOT click the List button yet. After filling everything, tell me what the Title field shows and what the price shows.`,
          { timeout: 50 }
        );

        const fillOutput = getOutput(fillResult);
        console.log("Fill result - success:", fillResult.success, "output:", fillOutput.substring(0, 300));

        if (!fillResult.success) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Failed to fill listing fields: " + (fillResult.error || ""),
          });
          return Response.json({ error: "Failed to fill fields", details: fillResult.error }, { status: 500 });
        }

        return Response.json({
          success: true,
          scrapeId: existingScrapeId,
          step: "fill",
          next: "submit",
          output: fillOutput.substring(0, 300),
        });
      }

      case "submit": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        // Click Save draft instead of List — user can review and publish manually
        const submitResult = await firecrawlInteract(
          existingScrapeId,
          `Click the "Save draft" button to save this listing as a draft. Then wait 3 seconds and describe what happened. Did you see a success message? An error? What does the page show now?`,
          { timeout: 50 }
        );

        const submitOutput = getOutput(submitResult);
        console.log("Save draft result - success:", submitResult.success, "output:", submitOutput.substring(0, 500));

        // Stop the interact session to free resources
        try { await firecrawlInteractStop(existingScrapeId); } catch {}

        const hasError = submitOutput.toLowerCase().includes("error") ||
          submitOutput.toLowerCase().includes("failed");
        const hasDraftSuccess = submitOutput.toLowerCase().includes("draft") ||
          submitOutput.toLowerCase().includes("saved") ||
          submitOutput.toLowerCase().includes("success");

        if (hasError && !hasDraftSuccess) {
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: submitOutput.substring(0, 200) || "Save draft may have failed",
            status: "error",
            error: "Mercari: " + (submitOutput.substring(0, 200) || "Save draft may have failed"),
          });
          return Response.json({
            success: false,
            error: "Draft may not have been saved",
            details: submitOutput.substring(0, 500),
          });
        }

        await updateListingField(redis, listings, listingId, {
          mercariStatus: "listed",
          status: "listed",
        });

        return Response.json({
          success: true,
          step: "submit",
          output: submitOutput.substring(0, 500),
          message: "Draft saved to Mercari. Go to your Mercari drafts to review and publish.",
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
