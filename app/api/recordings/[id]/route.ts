import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const redis = getRedis();

    const recordings = (await redis.get("fathom:recordings") as any[]) || [];
    const updated = recordings.map((r: any) =>
      r.id === id ? { ...r, ...body } : r
    );
    await redis.set("fathom:recordings", updated);

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
