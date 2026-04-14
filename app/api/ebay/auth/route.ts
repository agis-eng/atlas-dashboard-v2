import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

const CLIENT_ID = process.env.EBAY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "";
const RUNAME = process.env.EBAY_RUNAME || "";
const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
].join(" ");

const REDIS_KEY = "ebay:oauth:tokens";

interface EbayTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

async function loadTokens(): Promise<EbayTokens | null> {
  const redis = getRedis();
  return redis.get<EbayTokens>(REDIS_KEY);
}

async function saveTokens(tokens: EbayTokens): Promise<void> {
  const redis = getRedis();
  await redis.set(REDIS_KEY, tokens);
}

function basicAuth(): string {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

async function refreshAccessToken(refreshToken: string): Promise<EbayTokens> {
  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000 - 60000, // 1min buffer
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  switch (action) {
    // Step 1: Redirect to eBay consent page
    case "login": {
      const authUrl = new URL(EBAY_AUTH_URL);
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", RUNAME);
      authUrl.searchParams.set("scope", SCOPES);
      return Response.redirect(authUrl.toString());
    }

    // Step 2: Handle callback from eBay with auth code
    case "callback": {
      const code = searchParams.get("code");
      if (!code) {
        const error = searchParams.get("error_description") || searchParams.get("error") || "No code received";
        return Response.redirect(new URL(`/ebay?error=${encodeURIComponent(error)}`, request.url).toString());
      }

      const res = await fetch(EBAY_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth()}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: RUNAME,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return Response.redirect(
          new URL(`/ebay?error=${encodeURIComponent(`Token exchange failed: ${err}`)}`, request.url).toString()
        );
      }

      const data = await res.json();
      const tokens: EbayTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000 - 60000,
      };
      await saveTokens(tokens);

      return Response.redirect(new URL("/ebay?connected=true", request.url).toString());
    }

    // Step 3: Get a valid access token (auto-refreshes if expired)
    case "token": {
      const tokens = await loadTokens();
      if (!tokens) {
        return Response.json({ error: "Not connected. Please authorize with eBay first." }, { status: 401 });
      }

      // Refresh if expired
      if (Date.now() >= tokens.expires_at) {
        try {
          const refreshed = await refreshAccessToken(tokens.refresh_token);
          await saveTokens(refreshed);
          return Response.json({ access_token: refreshed.access_token });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Token refresh failed" },
            { status: 401 }
          );
        }
      }

      return Response.json({ access_token: tokens.access_token });
    }

    // Check connection status
    case "status": {
      const tokens = await loadTokens();
      if (!tokens) {
        return Response.json({ connected: false });
      }
      return Response.json({
        connected: true,
        expires_at: tokens.expires_at,
        expired: Date.now() >= tokens.expires_at,
      });
    }

    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
