import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

const APP_KEY = process.env.TIKTOK_SHOP_APP_KEY || "";
const APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET || "";
const TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
const REDIS_KEY = "tiktok:shop:tokens";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    const error = searchParams.get("error") || "No authorization code received";
    return Response.redirect(
      new URL(`/listings?error=${encodeURIComponent(error)}`, request.url).toString()
    );
  }

  if (!APP_KEY || !APP_SECRET) {
    return Response.redirect(
      new URL("/listings?error=TikTok+Shop+API+credentials+not+configured", request.url).toString()
    );
  }

  try {
    const res = await fetch(
      `${TOKEN_URL}?app_key=${APP_KEY}&app_secret=${APP_SECRET}&auth_code=${code}&grant_type=authorized_code`,
      { method: "GET" }
    );

    const data = await res.json();

    if (data.code !== 0 || !data.data?.access_token) {
      const msg = data.message || JSON.stringify(data);
      return Response.redirect(
        new URL(`/listings?error=${encodeURIComponent(`TikTok auth failed: ${msg}`)}`, request.url).toString()
      );
    }

    const tokens = {
      access_token: data.data.access_token,
      refresh_token: data.data.refresh_token,
      expires_at: Date.now() + (data.data.access_token_expire_in || 0) * 1000 - 60000,
      refresh_expires_at: Date.now() + (data.data.refresh_token_expire_in || 0) * 1000,
    };

    const redis = getRedis();
    await redis.set(REDIS_KEY, tokens);

    return Response.redirect(
      new URL("/listings?tiktok_connected=true", request.url).toString()
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "TikTok auth failed";
    return Response.redirect(
      new URL(`/listings?error=${encodeURIComponent(msg)}`, request.url).toString()
    );
  }
}
