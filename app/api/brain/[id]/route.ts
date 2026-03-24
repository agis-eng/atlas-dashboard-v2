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

export async function GET(
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
    const data = await readBrains(user.profile);
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error reading brain:", error);
    return NextResponse.json(
      { error: "Failed to read brain" },
      { status: 500 }
    );
  }
}
