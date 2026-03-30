import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

export async function GET() {
  try {
    const redis = getRedis();
    const recordings = await redis.get("fathom:recordings") as any[] | null;
    return Response.json({ recordings: Array.isArray(recordings) ? recordings : [] });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
