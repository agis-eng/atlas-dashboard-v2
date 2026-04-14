import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function GET(request: NextRequest) {
  try {
    const redis = getRedis();
    const recordings = (await redis.get(REDIS_KEYS.fathomRecordings)) as any[] | null;
    const all = Array.isArray(recordings) ? recordings : [];

    const projectId = request.nextUrl.searchParams.get("projectId");
    if (projectId) {
      return Response.json({
        recordings: all.filter((r) => r.projectId === projectId),
      });
    }

    return Response.json({ recordings: all });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
