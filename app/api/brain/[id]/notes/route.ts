import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

function getBrainsKey(userId: string) { return `brains:${userId}`; }

async function readBrains(userId: string) {
  const redis = getRedis();
  const data = await redis.get(getBrainsKey(userId));
  
  if (!data || typeof data !== 'object') {
    return { brains: [] };
  }
  
  return data as { brains: any[] };
}

async function writeBrains(userId: string, data: any) {
  const redis = getRedis();
  await redis.set(getBrainsKey(userId), data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { content } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const data = await readBrains(user.profile);
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    if (!brain.notes) {
      brain.notes = [];
    }

    brain.notes.push({
      content,
      date: new Date().toISOString()
    });

    brain.lastUpdated = new Date().toISOString().split('T')[0];
    await writeBrains(user.profile, data);

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error adding note:", error);
    return NextResponse.json(
      { error: "Failed to add note" },
      { status: 500 }
    );
  }
}
