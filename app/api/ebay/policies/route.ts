import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const policiesRaw = await redis.get("ebay:policies");
    const policies = policiesRaw
      ? (typeof policiesRaw === "string" ? JSON.parse(policiesRaw) : policiesRaw)
      : null;

    if (!policies) {
      return Response.json({ policies: null });
    }

    return Response.json({ policies });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
