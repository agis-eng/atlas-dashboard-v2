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
      return NextResponse.json({ summaries: [] });
    }

    // Summaries are now stored in the brain object in Redis
    const summaries = (brain.summaries || []).map((summary: any) => ({
      date: summary.date,
      preview: summary.content.substring(0, 200) + '...',
      content: summary.content
    }));

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("Error reading summaries:", error);
    return NextResponse.json(
      { error: "Failed to read summaries" },
      { status: 500 }
    );
  }
}
