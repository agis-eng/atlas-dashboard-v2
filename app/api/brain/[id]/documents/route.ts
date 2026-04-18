import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { put, del } from "@vercel/blob";
import crypto from "crypto";

const MAX_DOC_SIZE = 25 * 1024 * 1024; // 25 MB per document

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

    if (file.size > MAX_DOC_SIZE) {
      return NextResponse.json(
        { error: `File too large: max ${MAX_DOC_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob with a random key so URLs aren't guessable
    const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
    const blobKey = `brain/${id}/${crypto.randomUUID()}${ext}`;
    const blob = await put(blobKey, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
    });

    if (!brain.documents) {
      brain.documents = [];
    }

    brain.documents.push({
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      url: blob.url,
      blobKey,
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
    const { index } = await request.json();

    if (index === undefined || index === null) {
      return NextResponse.json({ error: "Document index required" }, { status: 400 });
    }

    const data = await readBrains(user.profile);
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    if (!brain.documents || index < 0 || index >= brain.documents.length) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const [removed] = brain.documents.splice(index, 1);
    brain.lastUpdated = new Date().toISOString().split("T")[0];
    await writeBrains(user.profile, data);

    if (removed?.url) {
      try {
        await del(removed.url);
      } catch (e) {
        console.error("Blob delete failed (continuing):", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
