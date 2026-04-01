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
    const lastPayload = await redis.get("fathom:debug:last_payload");
    const recordings = await redis.get("fathom:recordings");

    return Response.json({
      lastWebhookPayload: lastPayload || "No webhook received yet",
      recordingsCount: Array.isArray(recordings) ? recordings.length : 0,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
