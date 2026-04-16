import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft, MarketplaceConnection } from "@/lib/redis";
import { firecrawlBrowserCreate, firecrawlInteract, firecrawlInteractStop, MERCARI_PROFILE } from "@/lib/firecrawl";

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
        // Create a visible interactive browser session
        const browser = await firecrawlBrowserCreate({
          profile: MERCARI_PROFILE,
          ttl: 600,
          activityTtl: 600,
        });

        console.log("Browser create result:", JSON.stringify(browser).substring(0, 500));

        if (!browser.id) {
          console.error("Browser creation failed:", browser.error || JSON.stringify(browser));
          return Response.json(
            { error: "Failed to create browser session: " + (browser.error || "unknown"), details: browser.error },
            { status: 500 }
          );
        }

        // Navigate to Mercari sell page
        const navResult = await firecrawlInteract(
          browser.id,
          `Navigate to https://www.mercari.com/sell/ and wait for the page to load. Describe what you see on the page.`,
          { timeout: 30 }
        );

        const navOutput = getOutput(navResult);
        console.log("Mercari nav:", navOutput.substring(0, 200));

        // Check if logged in
        if (navOutput.toLowerCase().includes("log in") || navOutput.toLowerCase().includes("sign in")) {
          return Response.json({
            error: "Mercari session expired. Please reconnect your account.",
            liveViewUrl: browser.interactiveLiveViewUrl || browser.liveViewUrl,
          }, { status: 401 });
        }

        await updateListingField(redis, listings, listingId, { mercariStatus: "publishing" });

        return Response.json({
          success: true,
          scrapeId: browser.id,
          liveViewUrl: browser.interactiveLiveViewUrl || browser.liveViewUrl,
          step: "start",
          next: "fill",
        });
      }

      case "fill": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        const title = listing.title;
        const desc = listing.description;
        const price = listing.price!;
        const condition = listing.condition || "Good";
        const photos = listing.photos || [];

        // Step A: Upload photos if available
        if (photos.length > 0) {
          const photoUrls = photos.filter(Boolean).slice(0, 12);
          const photoPrompt = `On this Mercari "List an item" form, I need you to upload photos first.
Look for the photo upload area (usually says "Add up to 12 photos" or has a camera icon).
Click the photo upload button/area. A file picker dialog should appear.
For each of these image URLs, download and upload them as photos:
${photoUrls.map((url, i) => `Photo ${i + 1}: ${url}`).join("\n")}

If you can't upload from URLs directly, try using the browser's developer console to fetch and upload them programmatically. After uploading, tell me how many photos were added.`;

          const photoResult = await firecrawlInteract(
            existingScrapeId,
            photoPrompt,
            { timeout: 90 }
          );
          console.log("Photo upload full response:", JSON.stringify(photoResult).substring(0, 500));
          console.log("Photo upload result:", getOutput(photoResult).substring(0, 300));
          if (!photoResult.success) {
            console.error("Photo upload failed — scrapeId may be invalid. Error:", photoResult.error);
          }
        }

        // Step B: Fill all text fields
        const fillResult = await firecrawlInteract(
          existingScrapeId,
          `On this Mercari "List an item" form, do these steps in order:
1. Click the Title input field (textbox labeled "Title") and type exactly: ${title}
2. Click the Description textarea (textbox labeled "Description") and type exactly: ${desc}
3. Click on the "${condition}" condition option to select it
4. Click on "Ship on your own" under Shipping method (if not already selected)
5. Click the price input field (textbox with placeholder "min $1/max $2000") and type: ${price}
Do NOT click the List button yet. After filling everything, tell me what the Title field shows and what the price shows.`,
          { timeout: 120 }
        );

        const fillOutput = getOutput(fillResult);
        console.log("Fill full response:", JSON.stringify(fillResult).substring(0, 500));
        console.log("Fill result - success:", fillResult.success, "output:", fillOutput.substring(0, 300));

        if (!fillResult.success) {
          const errorDetail = fillResult.error || fillOutput || "Unknown error";
          console.error("Fill failed — full result:", JSON.stringify(fillResult).substring(0, 1000));
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Failed to fill listing fields: " + errorDetail,
          });
          return Response.json({
            error: "Failed to fill fields: " + errorDetail,
            details: errorDetail,
          }, { status: 500 });
        }

        return Response.json({
          success: true,
          scrapeId: existingScrapeId,
          step: "fill",
          next: "ready",
          output: fillOutput.substring(0, 300),
          message: "Fields filled! Review the listing in the browser window, add photos, then click List when ready.",
        });
      }

      case "submit": {
        if (!existingScrapeId) {
          return Response.json({ error: "scrapeId required" }, { status: 400 });
        }

        // Click List to publish the listing
        const submitResult = await firecrawlInteract(
          existingScrapeId,
          `Click the "List" button to publish this listing on Mercari. If there is no "List" button, try clicking "Save draft" instead. Then wait 5 seconds and describe what happened. Did you see a success message? An error? What does the page show now?`,
          { timeout: 60 }
        );

        const submitOutput = getOutput(submitResult);
        console.log("Save draft result:", submitOutput.substring(0, 500));

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
