import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft, MarketplaceConnection } from "@/lib/redis";
import {
  createSession,
  reconnectSession,
  releaseSession,
} from "@/lib/browserbase";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId, sessionId: existingSessionId, step } = await request.json();

    if (!listingId || !step) {
      return Response.json({ error: "listingId and step are required" }, { status: 400 });
    }

    const redis = getRedis();
    const listingsRaw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = listingsRaw
      ? typeof listingsRaw === "string"
        ? JSON.parse(listingsRaw)
        : (listingsRaw as ListingDraft[])
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
      ? typeof connRaw === "string"
        ? JSON.parse(connRaw)
        : (connRaw as MarketplaceConnection)
      : null;

    if (!connection?.connected) {
      return Response.json(
        { error: "Mercari account not connected. Connect it first." },
        { status: 400 }
      );
    }
    if (!connection.contextId) {
      return Response.json(
        { error: "Mercari connection missing context. Please reconnect." },
        { status: 400 }
      );
    }

    switch (step) {
      case "start": {
        // Create a keep-alive session using the saved Mercari context
        const session = await createSession({
          contextId: connection.contextId,
          persist: false,
          keepAlive: true,
          timeout: 600,
        });

        try {
          const { browser, page } = await reconnectSession(session.id);
          await page.goto("https://www.mercari.com/sell/", {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          await page.waitForTimeout(3000);
          const url = page.url();
          console.log("Start: landed on", url);
          await browser.close();

          if (url.includes("/login")) {
            await releaseSession(session.id);
            return Response.json(
              {
                error: "Mercari session expired. Please reconnect your account.",
                liveViewUrl: session.liveViewUrl,
              },
              { status: 401 }
            );
          }

          await updateListingField(redis, listings, listingId, {
            mercariStatus: "publishing",
          });

          return Response.json({
            success: true,
            sessionId: session.id,
            liveViewUrl: session.liveViewUrl,
            step: "start",
            next: "fill",
          });
        } catch (err: any) {
          await releaseSession(session.id);
          throw err;
        }
      }

      case "fill": {
        if (!existingSessionId) {
          return Response.json({ error: "sessionId required" }, { status: 400 });
        }

        const title = listing.title;
        const desc = listing.description || "";
        const price = listing.price!;
        const condition = listing.condition || "Good";
        const photos = (listing.photos || []).filter(Boolean).slice(0, 12);

        const { browser, page } = await reconnectSession(existingSessionId);

        try {
          // Make sure we're on the sell page
          if (!page.url().includes("/sell")) {
            await page.goto("https://www.mercari.com/sell/", {
              waitUntil: "domcontentloaded",
              timeout: 45000,
            });
            await page.waitForTimeout(2000);
          }

          // Upload photos via the hidden file input
          if (photos.length > 0) {
            console.log(`Uploading ${photos.length} photos...`);
            const files = await Promise.all(
              photos.map(async (url, i) => {
                const res = await fetch(url);
                const buf = Buffer.from(await res.arrayBuffer());
                return {
                  name: `photo-${i + 1}.jpg`,
                  mimeType: "image/jpeg",
                  buffer: buf,
                };
              })
            );

            const fileInput = page.locator('input[type="file"]').first();
            await fileInput.setInputFiles(files, { timeout: 60000 });
            // Wait for uploads to settle
            await page.waitForTimeout(5000);
            console.log("Photos uploaded");
          }

          // Fill Title
          console.log("Filling title...");
          const titleInput = page.getByLabel(/title/i).first();
          await titleInput.fill(title, { timeout: 30000 });

          // Fill Description
          if (desc) {
            console.log("Filling description...");
            const descInput = page.getByLabel(/description/i).first();
            await descInput.fill(desc, { timeout: 30000 });
          }

          // Select Condition (radio/button)
          console.log("Selecting condition:", condition);
          try {
            const conditionOption = page.getByRole("radio", { name: new RegExp(condition, "i") }).first();
            if (await conditionOption.isVisible({ timeout: 5000 })) {
              await conditionOption.check({ timeout: 10000 });
            } else {
              // Fall back to clicking a button with the condition label
              await page.getByRole("button", { name: new RegExp(condition, "i") }).first().click({ timeout: 10000 });
            }
          } catch (err) {
            console.warn("Could not select condition — user may need to pick manually:", String(err).substring(0, 200));
          }

          // Select "Ship on your own" shipping
          console.log("Selecting shipping: Ship on your own");
          try {
            const shipOption = page.getByText(/ship on your own/i).first();
            if (await shipOption.isVisible({ timeout: 5000 })) {
              await shipOption.click({ timeout: 10000 });
            }
          } catch (err) {
            console.warn("Could not select shipping — user may need to pick manually:", String(err).substring(0, 200));
          }

          // Fill Price
          console.log("Filling price:", price);
          try {
            const priceInput = page.getByLabel(/price/i).first();
            await priceInput.fill(String(price), { timeout: 30000 });
          } catch (err) {
            // Fallback: find input with dollar sign or min/max placeholder
            const altPrice = page.locator('input[placeholder*="min"]').first();
            await altPrice.fill(String(price), { timeout: 30000 });
          }

          await browser.close();

          return Response.json({
            success: true,
            sessionId: existingSessionId,
            step: "fill",
            next: "submit",
            message: "Fields filled. Review in the browser window, then click Submit.",
          });
        } catch (err: any) {
          console.error("Fill failed:", err);
          await browser.close();
          const errMsg = err?.message || String(err);
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Fill failed: " + errMsg.substring(0, 300),
          });
          return Response.json(
            { error: "Fill failed", details: errMsg.substring(0, 500) },
            { status: 500 }
          );
        }
      }

      case "submit": {
        if (!existingSessionId) {
          return Response.json({ error: "sessionId required" }, { status: 400 });
        }

        const { browser, page } = await reconnectSession(existingSessionId);

        try {
          // Try "List" button first; fall back to "Save draft"
          let clicked = false;
          let usedDraft = false;
          for (const name of [/^list$/i, /list it/i]) {
            try {
              const btn = page.getByRole("button", { name }).first();
              if (await btn.isVisible({ timeout: 3000 })) {
                await btn.click({ timeout: 10000 });
                clicked = true;
                break;
              }
            } catch {}
          }
          if (!clicked) {
            for (const name of [/save draft/i, /^save$/i]) {
              try {
                const btn = page.getByRole("button", { name }).first();
                if (await btn.isVisible({ timeout: 3000 })) {
                  await btn.click({ timeout: 10000 });
                  clicked = true;
                  usedDraft = true;
                  break;
                }
              } catch {}
            }
          }

          if (!clicked) {
            throw new Error("Could not find a List or Save draft button");
          }

          // Wait for navigation / success indicator
          await page.waitForTimeout(6000);
          const finalUrl = page.url();
          const bodyText = (await page.locator("body").innerText().catch(() => "")).substring(0, 1000);
          console.log("Submit ended on:", finalUrl);

          await browser.close();
          await releaseSession(existingSessionId);

          const looksSuccess =
            !finalUrl.includes("/sell") ||
            /listed|saved|success|published/i.test(bodyText);

          if (!looksSuccess) {
            await updateListingField(redis, listings, listingId, {
              mercariStatus: "error",
              mercariError: `Submit may have failed. Final URL: ${finalUrl}`,
              status: "error",
              error: `Mercari: Submit may have failed. Final URL: ${finalUrl}`,
            });
            return Response.json({
              success: false,
              error: "Submit may have failed",
              details: `Ended on ${finalUrl}`,
            });
          }

          await updateListingField(redis, listings, listingId, {
            mercariStatus: "listed",
            status: "listed",
            mercariListingUrl: finalUrl,
          });

          return Response.json({
            success: true,
            listingUrl: finalUrl,
            step: "submit",
            message: usedDraft
              ? "Draft saved to Mercari."
              : "Listed on Mercari.",
          });
        } catch (err: any) {
          console.error("Submit failed:", err);
          await browser.close();
          await releaseSession(existingSessionId);
          const errMsg = err?.message || String(err);
          await updateListingField(redis, listings, listingId, {
            mercariStatus: "error",
            mercariError: "Submit failed: " + errMsg.substring(0, 300),
            status: "error",
            error: "Mercari: " + errMsg.substring(0, 300),
          });
          return Response.json(
            { error: "Submit failed", details: errMsg.substring(0, 500) },
            { status: 500 }
          );
        }
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
