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

async function writeBrains(data: any) {
  const redis = getRedis();
  await redis.set(BRAINS_KEY, data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { url, title } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    const data = await readBrains();
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    if (!brain.links) {
      brain.links = [];
    }

    brain.links.push({
      url,
      title: title || url,
      saved: new Date().toISOString()
    });

    brain.lastUpdated = new Date().toISOString().split('T')[0];
    await writeBrains(data);

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error adding link:", error);
    return NextResponse.json(
      { error: "Failed to add link" },
      { status: 500 }
    );
  }
}
