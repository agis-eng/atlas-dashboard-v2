import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, MarketplaceConnection } from "@/lib/redis";
import {
  firecrawlBrowserCreate,
  firecrawlBrowserDelete,
  firecrawlScrape,
  firecrawlInteract,
  MERCARI_PROFILE,
  FACEBOOK_PROFILE,
} from "@/lib/firecrawl";
import { MERCARI_PROMPTS, FACEBOOK_PROMPTS } from "@/lib/marketplace-prompts";

const PLATFORM_CONFIG = {
  mercari: {
    loginUrl: "https://www.mercari.com/login/",
    profile: MERCARI_PROFILE,
    prompts: MERCARI_PROMPTS,
  },
  facebook: {
    loginUrl: "https://www.facebook.com/login/",
    profile: FACEBOOK_PROFILE,
    prompts: FACEBOOK_PROMPTS,
  },
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

    const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG];

    if (action === "start") {
      // Create an interactive browser session with persistent profile
      const result = await firecrawlBrowserCreate({
        profile: config.profile,
        ttl: 300, // 5 minutes to log in
        activityTtl: 300,
      });

      if (!result.success || !result.interactiveLiveViewUrl) {
        return Response.json(
          { error: "Failed to start browser session", details: result.error },
          { status: 500 }
        );
      }

      return Response.json({
        status: "login_required",
        sessionId: result.id,
        liveViewUrl: result.interactiveLiveViewUrl,
        expiresAt: result.expiresAt,
        message: `Open the link below to log into ${platform}. Your session is saved so you only need to do this once.`,
      });
    }

    if (action === "verify") {
      // After user logs in via live view, verify by scraping a protected page
      // The profile should now have auth cookies saved
      const testUrl = platform === "mercari"
        ? "https://www.mercari.com/mypage/"
        : "https://www.facebook.com/marketplace/you/selling/";

      const result = await firecrawlScrape(testUrl, {
        profile: config.profile,
        proxy: "stealth",
        waitFor: 5000,
        formats: ["markdown"],
      });

      const content = result.data?.markdown || "";
      const url = result.data?.metadata?.url || "";

      // Check if we got redirected to login (not authenticated) or stayed on the page
      const isLoggedIn = platform === "mercari"
        ? !url.includes("/login") && (content.includes("My Page") || content.includes("mypage") || content.includes("Selling") || content.includes("listing"))
        : !url.includes("/login") && (content.includes("Marketplace") || content.includes("selling") || content.includes("Your listings"));

      const redis = getRedis();
      const connection: MarketplaceConnection = {
        platform: platform as "mercari" | "facebook",
        profileName: config.profile.name,
        connected: isLoggedIn,
        lastValidated: new Date().toISOString(),
        error: isLoggedIn ? undefined : "Login not detected. Please try connecting again.",
      };
      await redis.set(REDIS_KEYS.marketplaceConnection(platform), JSON.stringify(connection));

      // Clean up the browser session if one was provided
      if (sessionId) {
        try { await firecrawlBrowserDelete(sessionId); } catch {}
      }

      // Stop the scrape interact session
      if (result.data?.metadata?.scrapeId) {
        try {
          const { firecrawlInteractStop } = await import("@/lib/firecrawl");
          await firecrawlInteractStop(result.data.metadata.scrapeId);
        } catch {}
      }

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
