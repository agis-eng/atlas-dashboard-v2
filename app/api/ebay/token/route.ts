import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const tokenRaw = await redis.get(REDIS_KEYS.ebayToken);

    if (!tokenRaw) {
      return Response.json({ connected: false });
    }

    const tokenData = typeof tokenRaw === "string" ? JSON.parse(tokenRaw) : tokenRaw;
    const isExpired = tokenData.expires_at && new Date(tokenData.expires_at) < new Date();

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
