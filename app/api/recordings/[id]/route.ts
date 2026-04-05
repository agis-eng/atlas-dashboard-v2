import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const redis = getRedis();

    const recordings = ((await redis.get(REDIS_KEYS.fathomRecordings)) as any[]) || [];
    const updated = recordings.map((r: any) =>
      r.id === id ? { ...r, ...body } : r
    );
    await redis.set(REDIS_KEYS.fathomRecordings, updated);

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const redis = getRedis();

    const recordings = ((await redis.get(REDIS_KEYS.fathomRecordings)) as any[]) || [];
    const filtered = recordings.filter((r: any) => r.id !== id);
    await redis.set(REDIS_KEYS.fathomRecordings, filtered);

    // Also clean up any stored transcript
    await redis.del(REDIS_KEYS.fathomTranscript(id));

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
