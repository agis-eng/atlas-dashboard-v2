import { NextRequest } from "next/server";
import { getTranscript } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return Response.json({ error: "videoId is required" }, { status: 400 });
  }

  try {
    const transcript = await getTranscript(videoId);
    if (transcript) {
      return Response.json({ transcript, source: "captions" });
    }
    return Response.json({ error: "No captions available" }, { status: 404 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch transcript" },
      { status: 500 }
    );
  }
}
