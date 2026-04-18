import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

function getBrainsKey(userId: string) {
  return `brains:${userId}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, index } = await params;
    const idx = parseInt(index, 10);
    if (!Number.isInteger(idx) || idx < 0) {
      return NextResponse.json({ error: "Invalid index" }, { status: 400 });
    }

    const redis = getRedis();
    const data = (await redis.get(getBrainsKey(user.profile))) as
      | { brains: any[] }
      | null;
    const brain = data?.brains?.find((b: any) => b.id === id);
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const doc = brain.documents?.[idx];
    if (!doc?.url) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const upstream = await fetch(doc.url);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream fetch failed: ${upstream.status}` },
        { status: 502 }
      );
    }

    const inline = request.nextUrl.searchParams.get("download") !== "1";
    const safeName = (doc.name || "document").replace(/"/g, "");
    return new Response(upstream.body, {
      headers: {
        "Content-Type": doc.type || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    console.error("Error streaming document:", error);
    return NextResponse.json(
      { error: "Failed to stream document" },
      { status: 500 }
    );
  }
}
