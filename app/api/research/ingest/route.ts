import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";
import { getTranscript } from "@/lib/youtube";

interface IngestItem {
  id: string;
  title: string;
  url: string;
  author: string;
  videoId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topic, items } = (await request.json()) as {
      topic: string;
      items: IngestItem[];
    };

    if (!topic || !items?.length) {
      return Response.json({ error: "topic and items are required" }, { status: 400 });
    }

    const documents: Array<{
      name: string;
      size: number;
      type: string;
      uploadedAt: string;
      content: string;
    }> = [];
    const ingestionErrors: string[] = [];

    for (const item of items) {
      const videoId = item.videoId || extractVideoId(item.url);
      if (!videoId) {
        ingestionErrors.push(`${item.title}: Could not extract video ID`);
        continue;
      }

      try {
        const transcriptText = await getTranscript(videoId);

        if (transcriptText) {
          const content = [
            `# ${item.title}`,
            `**Source:** ${item.url}`,
            `**Author:** ${item.author}`,
            `**Type:** YouTube Video Transcript`,
            "",
            "---",
            "",
            transcriptText,
          ].join("\n");

          documents.push({
            name: `${sanitize(item.title)}.md`,
            size: content.length,
            type: "text/markdown",
            uploadedAt: new Date().toISOString(),
            content,
          });
        } else {
          ingestionErrors.push(`${item.title}: No transcript available`);
        }
      } catch (err) {
        ingestionErrors.push(`${item.title}: ${err instanceof Error ? err.message : "Failed to fetch transcript"}`);
      }
    }

    if (!documents.length) {
      return Response.json(
        { error: "No content could be ingested", details: ingestionErrors },
        { status: 400 }
      );
    }

    // Create a new Brain with all the content
    const brainId = topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const brain = {
      id: brainId,
      name: topic,
      icon: "🔬",
      description: `Research on "${topic}" — ${documents.length} YouTube video transcripts`,
      schedule: "manual" as const,
      email_sources: [],
      documents,
      links: items.map((item) => ({
        url: item.url,
        title: item.title,
        saved: new Date().toISOString(),
      })),
      notes: [],
      summaries: [],
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    const redis = getRedis();
    const existing = (await redis.get(`brains:${user.profile}`)) as { brains: any[] } | null;
    const brains = existing?.brains || [];

    const existingIdx = brains.findIndex((b: any) => b.id === brainId);
    if (existingIdx >= 0) {
      brains[existingIdx].documents = [
        ...(brains[existingIdx].documents || []),
        ...documents,
      ];
      brains[existingIdx].links = [
        ...(brains[existingIdx].links || []),
        ...brain.links,
      ];
      brains[existingIdx].lastUpdated = new Date().toISOString();
      brains[existingIdx].description = brain.description;
    } else {
      brains.unshift(brain);
    }

    await redis.set(`brains:${user.profile}`, { brains });

    return Response.json({
      success: true,
      brainId,
      documentsIngested: documents.length,
      errors: ingestionErrors.length ? ingestionErrors : undefined,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Ingestion failed" },
      { status: 500 }
    );
  }
}

function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] || null;
}

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .substring(0, 80);
}
