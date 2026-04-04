import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const redis = getRedis();
    const key = "voice-memos:processed";
    const memos = ((await redis.get(key)) as any[]) || [];
    const filtered = memos.filter((m: any) => m.id !== id);
    await redis.set(key, filtered);

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const redis = getRedis();
    const key = "voice-memos:processed";
    const memos = ((await redis.get(key)) as any[]) || [];

    const idx = memos.findIndex((m: any) => m.id === id);
    if (idx === -1) {
      return Response.json({ error: "Memo not found" }, { status: 404 });
    }

    // Update fields
    if (body.projectMatch !== undefined) memos[idx].projectMatch = body.projectMatch;
    if (body.clientMatch !== undefined) memos[idx].clientMatch = body.clientMatch;
    if (body.title !== undefined) memos[idx].title = body.title;
    if (body.type !== undefined) memos[idx].type = body.type;

    await redis.set(key, memos);

    return Response.json({ success: true, memo: memos[idx] });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
