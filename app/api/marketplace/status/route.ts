import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, MarketplaceConnection } from "@/lib/redis";

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const [mercariRaw, facebookRaw] = await Promise.all([
      redis.get(REDIS_KEYS.marketplaceConnection("mercari")),
      redis.get(REDIS_KEYS.marketplaceConnection("facebook")),
    ]);

    const mercari: MarketplaceConnection | null = mercariRaw
      ? (typeof mercariRaw === "string" ? JSON.parse(mercariRaw) : mercariRaw)
      : null;
    const facebook: MarketplaceConnection | null = facebookRaw
      ? (typeof facebookRaw === "string" ? JSON.parse(facebookRaw) : facebookRaw)
      : null;

    return Response.json({ mercari, facebook });
  } catch (error: any) {
    console.error("Marketplace status error:", error);
    return Response.json(
      { error: "Failed to get marketplace status", details: error.message },
      { status: 500 }
    );
  }
}
