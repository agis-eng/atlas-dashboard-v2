import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

const CLIENT_ID = process.env.EBAY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "";
const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
].join(" ");

function basicAuth(): string {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    let tokenRaw = await redis.get(REDIS_KEYS.ebayToken);

    // Migration: check old key if new key is empty
    if (!tokenRaw) {
      const oldToken = await redis.get("ebay:oauth:tokens");
      if (oldToken) {
        // Migrate to the correct key
        await redis.set(REDIS_KEYS.ebayToken, typeof oldToken === "string" ? oldToken : JSON.stringify(oldToken));
        await redis.del("ebay:oauth:tokens");
        tokenRaw = await redis.get(REDIS_KEYS.ebayToken);
      }
    }

    if (!tokenRaw) {
      // No token stored — try client credentials to get an app token automatically
      if (CLIENT_ID && CLIENT_SECRET) {
        try {
          const res = await fetch(EBAY_TOKEN_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${basicAuth()}`,
            },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              scope: SCOPES,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const tokenData = {
              access_token: data.access_token,
              refresh_token: "",
              token_type: data.token_type,
              expires_in: data.expires_in,
              stored_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
            };
            await redis.set(REDIS_KEYS.ebayToken, JSON.stringify(tokenData));
            return Response.json({
              connected: true,
              token: data.access_token,
              tokenType: data.token_type,
            });
          }
        } catch (err) {
          console.error("eBay client credentials error:", err);
        }
      }
      return Response.json({ connected: false });
    }

    const tokenData = typeof tokenRaw === "string" ? JSON.parse(tokenRaw) : tokenRaw;

    // Check if expired
    const expiresAt = tokenData.expires_at
      ? (typeof tokenData.expires_at === "number" ? tokenData.expires_at : new Date(tokenData.expires_at).getTime())
      : 0;
    const isExpired = expiresAt > 0 && Date.now() >= expiresAt;

    // Auto-refresh if expired and we have a refresh token
    if (isExpired && tokenData.refresh_token && CLIENT_ID && CLIENT_SECRET) {
      try {
        const res = await fetch(EBAY_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth()}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: tokenData.refresh_token,
            scope: SCOPES,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const refreshed = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || tokenData.refresh_token,
            token_type: data.token_type,
            expires_in: data.expires_in,
            stored_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          };
          await redis.set(REDIS_KEYS.ebayToken, JSON.stringify(refreshed));
          return Response.json({
            connected: true,
            token: data.access_token,
            tokenType: data.token_type,
          });
        }
      } catch (err) {
        console.error("eBay token refresh error:", err);
      }
    }

    // If expired and no refresh token, try client credentials
    if (isExpired && !tokenData.refresh_token && CLIENT_ID && CLIENT_SECRET) {
      try {
        const res = await fetch(EBAY_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth()}`,
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: SCOPES,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const newToken = {
            access_token: data.access_token,
            refresh_token: "",
            token_type: data.token_type,
            expires_in: data.expires_in,
            stored_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          };
          await redis.set(REDIS_KEYS.ebayToken, JSON.stringify(newToken));
          return Response.json({
            connected: true,
            token: data.access_token,
            tokenType: data.token_type,
          });
        }
      } catch (err) {
        console.error("eBay client credentials error:", err);
      }
    }

    return Response.json({
      connected: !isExpired,
      token: tokenData.access_token,
      tokenType: tokenData.token_type,
      expiresAt: tokenData.expires_at,
      isExpired,
    });
  } catch (error: any) {
    console.error("eBay token error:", error);
    return Response.json(
      { error: "Failed to get eBay token", details: error.message },
      { status: 500 }
    );
  }
}
