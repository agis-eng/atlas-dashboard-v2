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
    const { type, sender } = await request.json();

    const data = await readBrains(user.profile);
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    // Add email source if not already present
    if (type === "email" && sender) {
      if (!brain.email_sources) {
        brain.email_sources = [];
      }
      
      if (!brain.email_sources.includes(sender)) {
        brain.email_sources.push(sender);
        brain.lastUpdated = new Date().toISOString().split('T')[0];
        await writeBrains(user.profile, data);
      }
    }

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error adding source to brain:", error);
    return NextResponse.json(
      { error: "Failed to add source" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const { sender } = await request.json();

    const data = await readBrains(user.profile);
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    if (brain.email_sources) {
      brain.email_sources = brain.email_sources.filter((s: string) => s !== sender);
      brain.lastUpdated = new Date().toISOString().split('T')[0];
      await writeBrains(user.profile, data);
    }

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error removing source:", error);
    return NextResponse.json(
      { error: "Failed to remove source" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await readBrains(user.profile);
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      email_sources: brain.email_sources || [],
      documents: brain.documents || [],
      links: brain.links || [],
      notes: brain.notes || []
    });
  } catch (error) {
    console.error("Error reading brain sources:", error);
    return NextResponse.json(
      { error: "Failed to read sources" },
      { status: 500 }
    );
  }
}
