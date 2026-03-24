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
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
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

    // For now, store document content in Redis (small files only)
    // TODO: Use S3 or similar for production
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;
    
    let content = null;
    // Only store text content for small files
    if ((file.name.endsWith('.txt') || file.name.endsWith('.md')) && file.size < 100000) {
      content = buffer.toString('utf-8');
    }

    // Update brain metadata
    if (!brain.documents) {
      brain.documents = [];
    }

    brain.documents.push({
      name: filename,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      content: content // Store inline for small text files
    });

    brain.lastUpdated = new Date().toISOString().split('T')[0];
    await writeBrains(user.profile, data);

    return NextResponse.json({ 
      success: true, 
      document: brain.documents[brain.documents.length - 1]
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    );
  }
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

    return NextResponse.json({
      documents: brain.documents || []
    });
  } catch (error) {
    console.error("Error reading documents:", error);
    return NextResponse.json(
      { error: "Failed to read documents" },
      { status: 500 }
    );
  }
}
