import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const { getSessionUserFromRequest } = await import("@/lib/auth");
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.videoUrl) {
    return NextResponse.json({ error: "videoUrl required" }, { status: 400 });
  }

  const token = process.env.BRAIN_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Server missing BRAIN_INGEST_TOKEN" },
      { status: 500 }
    );
  }

  const redis = getRedis();
  const tunnelUrl = (await redis.get("transcript:server:url")) as string | null;
  if (!tunnelUrl) {
    return NextResponse.json(
      { error: "Mac tunnel offline — is transcript-server running?" },
      { status: 503 }
    );
  }

  const upstream = await fetch(`${tunnelUrl}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
