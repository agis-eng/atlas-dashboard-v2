import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";

export const maxDuration = 300;

// Thin proxy to the Mac-local marketplace-server's /facebook/* endpoints.
// Mirrors the Mercari route structure; same tunnel URL under
// REDIS_KEYS.mercariServerUrl serves both marketplaces.

async function getMacServerUrl(redis: ReturnType<typeof getRedis>) {
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  const url = typeof raw === "string" ? raw : String(raw);
  return url.replace(/\/+$/, "");
}

async function callMacServer(
  base: string,
  path: string,
  body: any,
  secret: string | undefined
) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Mercari-Secret": secret } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.substring(0, 500) };
  }
  return { ok: res.ok, status: res.status, data };
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId, sessionId: existingSessionId, step } =
      await request.json();

    if (!listingId || !step) {
      return Response.json(
        { error: "listingId and step are required" },
        { status: 400 }
      );
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
      return Response.json(
        { error: "Title and price are required" },
        { status: 400 }
      );
    }

    const serverUrl = await getMacServerUrl(redis);
    if (!serverUrl) {
      return Response.json(
        {
          error:
            "Mac marketplace-server is not reachable. Make sure your Mac is on and the com.atlas.mercari-tunnel launchd agent is running.",
        },
        { status: 503 }
      );
    }

    const secret = process.env.MERCARI_SERVER_SECRET;

    switch (step) {
      case "start": {
        const { ok, status, data } = await callMacServer(
          serverUrl,
          "/facebook/start",
          {},
          secret
        );
        if (!ok) {
          return Response.json(
            {
              error: data?.error || "Mac server start failed",
              details:
                typeof data?.error === "string"
                  ? data.error
                  : JSON.stringify(data).substring(0, 500),
            },
            { status }
          );
        }
        await updateListingField(redis, listings, listingId, {
          facebookStatus: "publishing",
        });
        return Response.json({
          success: true,
          sessionId: data.sessionId,
          liveViewUrl: null,
          step: "start",
          next: "fill",
        });
      }

      case "fill": {
        if (!existingSessionId) {
          return Response.json(
            { error: "sessionId required" },
            { status: 400 }
          );
        }
        const { ok, status, data } = await callMacServer(
          serverUrl,
          "/facebook/fill",
          { sessionId: existingSessionId, listing },
          secret
        );
        if (!ok) {
          await updateListingField(redis, listings, listingId, {
            facebookStatus: "error",
            facebookError:
              "Fill failed: " + String(data?.error || "").substring(0, 300),
          });
          return Response.json(
            {
              error: "Fill failed",
              details:
                typeof data?.error === "string"
                  ? data.error
                  : JSON.stringify(data).substring(0, 500),
            },
            { status: status || 500 }
          );
        }
        const fieldStatus = data.fieldStatus || {};
        await updateListingField(redis, listings, listingId, {
          facebookFieldStatus: JSON.stringify(fieldStatus).substring(0, 500),
        });
        return Response.json({
          success: true,
          sessionId: existingSessionId,
          step: "fill",
          next: "submit",
          fieldStatus,
          message: "Fields filled. Review on the Mac, then click Submit.",
        });
      }

      case "submit": {
        if (!existingSessionId) {
          return Response.json(
            { error: "sessionId required" },
            { status: 400 }
          );
        }
        const { ok, status, data } = await callMacServer(
          serverUrl,
          "/facebook/submit",
          { sessionId: existingSessionId },
          secret
        );
        if (!ok) {
          const errMsg = String(data?.error || "Submit failed").substring(0, 300);
          await updateListingField(redis, listings, listingId, {
            facebookStatus: "error",
            facebookError: "Submit failed: " + errMsg,
            status: "error",
            error: "Facebook: " + errMsg,
          });
          return Response.json(
            {
              error: "Submit failed",
              details:
                typeof data?.error === "string"
                  ? data.error
                  : JSON.stringify(data).substring(0, 500),
            },
            { status: status || 500 }
          );
        }

        const {
          success,
          finalUrl,
          validationErrors,
          bodyText,
          buttonTexts,
          clicked,
        } = data;

        if (!success) {
          const fillStatus = listing.facebookFieldStatus || "";
          const diag = `Final URL: ${finalUrl} | Clicked: ${clicked}${
            fillStatus ? ` | Fill: ${fillStatus}` : ""
          }${
            validationErrors ? ` | Validation: ${validationErrors}` : ""
          } | Body: ${(bodyText || "").replace(/\s+/g, " ")} | Buttons: ${buttonTexts || ""}`;
          await updateListingField(redis, listings, listingId, {
            facebookStatus: "error",
            facebookError: diag.substring(0, 500),
            status: "error",
            error: `Facebook: Submit may have failed. ${diag.substring(0, 400)}`,
          });
          return Response.json({
            success: false,
            error: "Submit may have failed",
            details: diag,
          });
        }

        await updateListingField(redis, listings, listingId, {
          facebookStatus: "listed",
          status: "listed",
          facebookListingUrl: finalUrl,
        });
        return Response.json({
          success: true,
          listingUrl: finalUrl,
          step: "submit",
          message: "Listed on Facebook Marketplace.",
        });
      }

      default:
        return Response.json({ error: "Invalid step" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Facebook publish proxy error:", error);
    return Response.json(
      { error: "Failed to publish to Facebook", details: error.message },
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
    l.id === listingId
      ? { ...l, ...updates, updatedAt: new Date().toISOString() }
      : l
  );
  await redis.set(REDIS_KEYS.listings, JSON.stringify(updated));
}
