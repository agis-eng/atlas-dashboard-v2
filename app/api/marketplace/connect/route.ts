import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, MarketplaceConnection } from "@/lib/redis";

// The connect endpoint no longer uses Browserbase — it proxies to the Mac-
// local marketplace-server's /{platform}/login endpoint, which opens a login
// tab in the persistent Chromium window on the Mac. The Mac's profile dir is
// what holds the actual login state; this route just keeps an optimistic
// "connected" flag in Redis so the UI's Publish button stays enabled.

export async function DELETE(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    if (!platform || !["mercari", "facebook"].includes(platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }

    const redis = getRedis();
    await redis.del(REDIS_KEYS.marketplaceConnection(platform));
    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Disconnect error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function getMacServerUrl(redis: ReturnType<typeof getRedis>) {
  const raw = await redis.get(REDIS_KEYS.mercariServerUrl);
  if (!raw) return null;
  const url = typeof raw === "string" ? raw : String(raw);
  return url.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { platform, action } = await request.json();
    if (!platform || !["mercari", "facebook"].includes(platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }

    const redis = getRedis();

    if (action === "start") {
      const serverUrl = await getMacServerUrl(redis);
      if (!serverUrl) {
        return Response.json(
          {
            error:
              "Mac marketplace-server is not reachable. Make sure your Mac is on and the mercari-tunnel launchd agent is running.",
          },
          { status: 503 }
        );
      }

      // Tell the Mac server to open a login tab
      const secret = process.env.MERCARI_SERVER_SECRET;
      const res = await fetch(`${serverUrl}/${platform}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Mercari-Secret": secret } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return Response.json(
          {
            error: "Failed to open login tab on the Mac",
            details:
              typeof data?.error === "string"
                ? data.error
                : JSON.stringify(data).substring(0, 300),
          },
          { status: 502 }
        );
      }

      // Optimistically mark as connected so the UI's Publish button unlocks.
      // Actual login state lives in the Mac profile — publish attempts will
      // fail with a clear 401 if the user didn't complete the login tab.
      const connection: MarketplaceConnection = {
        platform: platform as "mercari" | "facebook",
        profileName: `${platform}-mac-local`,
        connected: true,
        lastValidated: new Date().toISOString(),
      };
      await redis.set(
        REDIS_KEYS.marketplaceConnection(platform),
        JSON.stringify(connection)
      );

      return Response.json({
        status: "login_required",
        macLogin: true,
        message: `A ${platform} login tab was opened in the Chromium window on your Mac. Log in there, then close the tab.`,
      });
    }

    if (action === "verify") {
      // No remote verification needed — login state is on the Mac profile.
      // Just return the stored connection record.
      const existingRaw = await redis.get(
        REDIS_KEYS.marketplaceConnection(platform)
      );
      const connection: MarketplaceConnection | null = existingRaw
        ? typeof existingRaw === "string"
          ? JSON.parse(existingRaw)
          : (existingRaw as MarketplaceConnection)
        : null;
      return Response.json({
        connection: connection || {
          platform,
          profileName: `${platform}-mac-local`,
          connected: false,
          lastValidated: new Date().toISOString(),
        },
      });
    }

    return Response.json(
      { error: "Invalid action. Use 'start' or 'verify'" },
      { status: 400 }
    );
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("MKT_CONNECT_ERROR:", msg);
    return Response.json(
      { error: "Failed to connect marketplace: " + msg.substring(0, 300) },
      { status: 500 }
    );
  }
}
