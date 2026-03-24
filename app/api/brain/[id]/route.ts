import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const BRAINS_KEY = "brains:data";

async function readBrains() {
  const redis = getRedis();
  const data = await redis.get(BRAINS_KEY);
  
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
    const { id } = await params;
    const data = await readBrains();
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
