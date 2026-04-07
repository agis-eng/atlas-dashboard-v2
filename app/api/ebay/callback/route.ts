import { NextRequest, NextResponse } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || "";
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "";
const EBAY_RUNAME = process.env.EBAY_RUNAME || "";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  // Log all params for debugging
  const allParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  console.log("eBay callback params:", JSON.stringify(allParams));

  if (!code) {
    // Check if this is an auth declined redirect or Auth'n'Auth
    const error = request.nextUrl.searchParams.get("error");
    if (error) {
      return NextResponse.redirect(
        new URL(`/ebay?error=${encodeURIComponent("eBay authorization was declined")}`, request.url)
      );
    }
    // Auth'n'Auth returns different params
    const isAuthSuccessful = request.nextUrl.searchParams.get("isAuthSuccessful");
    if (isAuthSuccessful === "false") {
      return NextResponse.redirect(
        new URL("/ebay?error=eBay+auth+was+declined", request.url)
      );
    }
    return NextResponse.redirect(
      new URL(`/ebay?error=${encodeURIComponent("No authorization code received. Params: " + JSON.stringify(allParams))}`, request.url)
    );
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_RUNAME) {
    return NextResponse.redirect(
      new URL("/ebay?error=eBay+OAuth+credentials+not+configured", request.url)
    );
  }

  try {
    // Exchange authorization code for access token
    const basicAuth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");

    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: EBAY_RUNAME,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error("eBay token exchange error:", JSON.stringify(tokenData));
      console.error("eBay token exchange status:", tokenRes.status);
      console.error("eBay credentials check - client_id present:", !!EBAY_CLIENT_ID, "secret present:", !!EBAY_CLIENT_SECRET, "runame:", EBAY_RUNAME);
      const errorMsg = tokenData.error_description || tokenData.error || `Token exchange failed (${tokenRes.status})`;
      return NextResponse.redirect(
        new URL(
          `/ebay?error=${encodeURIComponent(errorMsg)}`,
          request.url
        )
      );
    }

    // Store token in Redis
    const redis = getRedis();
    await redis.set(
      REDIS_KEYS.ebayToken,
      JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        stored_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      })
    );

    return NextResponse.redirect(new URL("/ebay?connected=true", request.url));
  } catch (error: any) {
    console.error("eBay OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(`/ebay?error=${encodeURIComponent(error.message || "OAuth callback failed")}`, request.url)
    );
  }
}
