import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const maxDuration = 180; // transcription can take a while

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const expected = process.env.BRAIN_INGEST_TOKEN;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.videoUrl) {
    return NextResponse.json({ error: "videoUrl required" }, { status: 400 });
  }

  const redis = getRedis();
  const tunnelUrl = (await redis.get("transcript:server:url")) as string | null;
  if (!tunnelUrl) {
    return NextResponse.json(
      { error: "Mac tunnel URL not published — is the transcript-server running?" },
      { status: 503 }
    );
  }

  const upstream = await fetch(`${tunnelUrl}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${expected}`,
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
