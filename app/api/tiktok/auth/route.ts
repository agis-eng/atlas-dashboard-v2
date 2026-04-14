import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

const APP_KEY = process.env.TIKTOK_SHOP_APP_KEY || "";
const APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET || "";
const AUTHORIZE_URL = "https://services.us.tiktokshop.com/open/authorize";
const TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
const REDIS_KEY = "tiktok:shop:tokens";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  switch (action) {
    case "login": {
      if (!APP_KEY) {
        return Response.json({ error: "TikTok Shop API credentials not configured" }, { status: 500 });
      }
      const state = crypto.randomUUID();
      const authUrl = `${AUTHORIZE_URL}?service_id=${APP_KEY}&state=${state}`;
      return Response.redirect(authUrl);
    }

    case "status": {
      const redis = getRedis();
      const tokens = await redis.get(REDIS_KEY) as Record<string, unknown> | null;
      if (!tokens) {
        return Response.json({ connected: false });
      }
      return Response.json({
        connected: true,
        expires_at: tokens.expires_at,
        expired: Date.now() >= (tokens.expires_at as number),
      });
    }

    case "token": {
      const redis = getRedis();
      const tokens = await redis.get(REDIS_KEY) as Record<string, unknown> | null;
      if (!tokens) {
        return Response.json({ error: "Not connected to TikTok Shop" }, { status: 401 });
      }

      // Refresh if expired
      if (Date.now() >= (tokens.expires_at as number)) {
        try {
          const res = await fetch(
            `https://${TOKEN_URL}?app_key=${APP_KEY}&app_secret=${APP_SECRET}&refresh_token=${tokens.refresh_token}&grant_type=refresh_token`,
            { method: "GET" }
          );
          const data = await res.json();
          if (data.code !== 0) {
            return Response.json({ error: "Token refresh failed" }, { status: 401 });
          }
          const refreshed = {
            ...tokens,
            access_token: data.data.access_token,
            refresh_token: data.data.refresh_token || tokens.refresh_token,
            expires_at: Date.now() + (data.data.access_token_expire_in || 0) * 1000 - 60000,
          };
          await redis.set(REDIS_KEY, refreshed);
          return Response.json({ access_token: refreshed.access_token });
        } catch {
          return Response.json({ error: "Token refresh failed" }, { status: 401 });
        }
      }

      return Response.json({ access_token: tokens.access_token });
    }

    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
