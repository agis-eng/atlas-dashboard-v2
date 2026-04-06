import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, MarketplaceConnection } from "@/lib/redis";
import { firecrawlScrape, firecrawlInteract, MERCARI_PROFILE, FACEBOOK_PROFILE } from "@/lib/firecrawl";
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

    const { platform, action, scrapeId } = await request.json();

    if (!platform || !["mercari", "facebook"].includes(platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }

    const config = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG];

    if (action === "start") {
      // Start a browser session at the login page with a persistent profile
      const result = await firecrawlScrape(config.loginUrl, {
        profile: config.profile,
        proxy: "stealth",
        waitFor: 5000,
        formats: ["markdown", "screenshot"],
      });

      if (!result.success || !result.data?.metadata?.scrapeId) {
        return Response.json(
          { error: "Failed to start browser session", details: result.error },
          { status: 500 }
        );
      }

      const scrapeId = result.data.metadata.scrapeId;

      // Check if already logged in from a previous session
      const checkResult = await firecrawlInteract(scrapeId, config.prompts.checkLogin, { timeout: 30 });
      const output = checkResult.data?.output || "";
      const alreadyLoggedIn = output.toLowerCase().includes("logged in") || output.toLowerCase().includes("successful");

      if (alreadyLoggedIn) {
        // Already authenticated via profile cookies
        const redis = getRedis();
        const connection: MarketplaceConnection = {
          platform: platform as "mercari" | "facebook",
          profileName: config.profile.name,
          connected: true,
          lastValidated: new Date().toISOString(),
          username: extractUsername(output),
        };
        await redis.set(REDIS_KEYS.marketplaceConnection(platform), JSON.stringify(connection));

        return Response.json({
          status: "already_connected",
          scrapeId,
          connection,
        });
      }

      // Not logged in — user needs to log in via the interact session
      // Return the scrapeId so the frontend can call verify after login
      return Response.json({
        status: "login_required",
        scrapeId,
        message: `Please log in to ${platform} in the browser session. The session is using a persistent profile so you only need to do this once.`,
      });
    }

    if (action === "verify") {
      if (!scrapeId) {
        return Response.json({ error: "scrapeId required for verify" }, { status: 400 });
      }

      // Check if login succeeded
      const checkResult = await firecrawlInteract(scrapeId, config.prompts.checkLogin, { timeout: 30 });
      const output = checkResult.data?.output || "";
      const loggedIn = output.toLowerCase().includes("logged in") || output.toLowerCase().includes("successful");

      const redis = getRedis();
      const connection: MarketplaceConnection = {
        platform: platform as "mercari" | "facebook",
        profileName: config.profile.name,
        connected: loggedIn,
        lastValidated: new Date().toISOString(),
        username: loggedIn ? extractUsername(output) : undefined,
        error: loggedIn ? undefined : "Login not detected. Please try again.",
      };
      await redis.set(REDIS_KEYS.marketplaceConnection(platform), JSON.stringify(connection));

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

function extractUsername(output: string): string | undefined {
  // Try to find a username/display name from the check login output
  const match = output.match(/(?:username|name|user)[:\s]+["']?([^"'\n,]+)/i);
  return match?.[1]?.trim();
}
