import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, MarketplaceConnection } from "@/lib/redis";
import {
  createContext,
  createSession,
  reconnectSession,
  releaseSession,
} from "@/lib/browserbase";

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

const LOGIN_URLS = {
  mercari: "https://www.mercari.com/login/",
  facebook: "https://www.facebook.com/login/",
} as const;

const VERIFY_URLS = {
  mercari: "https://www.mercari.com/mypage/",
  facebook: "https://www.facebook.com/marketplace/you/selling/",
} as const;

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { platform, action, sessionId } = await request.json();

    if (!platform || !["mercari", "facebook"].includes(platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }

    const redis = getRedis();

    if (action === "start") {
      // Get or create a persistent Browserbase context for this platform
      const existingRaw = await redis.get(REDIS_KEYS.marketplaceConnection(platform));
      const existing: MarketplaceConnection | null = existingRaw
        ? typeof existingRaw === "string"
          ? JSON.parse(existingRaw)
          : (existingRaw as MarketplaceConnection)
        : null;

      const contextId = existing?.contextId || (await createContext());

      // Create a browser session using that context with persist: true
      // so the user's login gets saved for later publish sessions
      const session = await createSession({
        contextId,
        persist: true,
        keepAlive: true,
        timeout: 600,
      });

      // Navigate to the login page in the session
      const { browser, page } = await reconnectSession(session.id);
      await page.goto(LOGIN_URLS[platform as keyof typeof LOGIN_URLS], {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await browser.close();

      // Save the contextId immediately so subsequent sessions reuse it
      const pendingConnection: MarketplaceConnection = {
        platform: platform as "mercari" | "facebook",
        profileName: `${platform}-session`,
        connected: existing?.connected || false,
        lastValidated: existing?.lastValidated || new Date().toISOString(),
        contextId,
      };
      await redis.set(
        REDIS_KEYS.marketplaceConnection(platform),
        JSON.stringify(pendingConnection)
      );

      return Response.json({
        status: "login_required",
        sessionId: session.id,
        liveViewUrl: session.liveViewUrl,
        message: `Open the link below to log into ${platform}. Your session is saved so you only need to do this once.`,
      });
    }

    if (action === "verify") {
      const existingRaw = await redis.get(REDIS_KEYS.marketplaceConnection(platform));
      const existing: MarketplaceConnection | null = existingRaw
        ? typeof existingRaw === "string"
          ? JSON.parse(existingRaw)
          : (existingRaw as MarketplaceConnection)
        : null;

      if (!existing?.contextId) {
        return Response.json(
          { error: "No connection in progress. Start a new connection first." },
          { status: 400 }
        );
      }

      // Release the old session used for login (so its cookies get saved to the context)
      if (sessionId) {
        await releaseSession(sessionId);
        // Wait for context to be committed
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Create a fresh session using the saved context to verify login persisted
      const verifySession = await createSession({
        contextId: existing.contextId,
        persist: false,
        keepAlive: false,
        timeout: 60,
      });

      let isLoggedIn = false;
      let finalUrl = "";
      try {
        const { browser, page } = await reconnectSession(verifySession.id);
        await page.goto(VERIFY_URLS[platform as keyof typeof VERIFY_URLS], {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        // Give the page a moment to redirect if not logged in
        await page.waitForTimeout(2000);
        finalUrl = page.url();
        isLoggedIn = !finalUrl.includes("/login");
        await browser.close();
      } finally {
        await releaseSession(verifySession.id);
      }

      const connection: MarketplaceConnection = {
        platform: platform as "mercari" | "facebook",
        profileName: existing.profileName,
        connected: isLoggedIn,
        lastValidated: new Date().toISOString(),
        contextId: existing.contextId,
        error: isLoggedIn
          ? undefined
          : `Login not detected (ended on ${finalUrl}). Please try connecting again.`,
      };
      await redis.set(
        REDIS_KEYS.marketplaceConnection(platform),
        JSON.stringify(connection)
      );

      return Response.json({ connection });
    }

    return Response.json({ error: "Invalid action. Use 'start' or 'verify'" }, { status: 400 });
  } catch (error: any) {
    console.error("Marketplace connect error:", error);
    return Response.json(
      { error: "Failed to connect marketplace", details: error.message },
      { status: 500 }
    );
  }
}
