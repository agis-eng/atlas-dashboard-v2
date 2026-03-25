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
    
    // Trigger brain summarizer script for this specific brain
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);
    
    await execPromise(`node /Users/eriklaine/.openclaw/workspace/scripts/brain-summarizer.js --brain-id ${id}`);
    
    return NextResponse.json({ success: true, message: "Summary generation started" });
  } catch (error: any) {
    console.error("Error generating summary:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}
