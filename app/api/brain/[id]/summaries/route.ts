import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function getBrainsKey(userId: string) { return `brains:${userId}`; }

async function readBrains(userId: string) {
  const redis = getRedis();
  const data = await redis.get(getBrainsKey(userId));
  if (!data || typeof data !== 'object') return { brains: [] };
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

    const summaries = (brain.summaries || []).map((summary: any) => ({
      date: summary.date,
      preview: summary.content?.substring(0, 200) + '...',
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
    const redis = getRedis();
    const data = await readBrains(user.profile);
    const brainIndex = data.brains.findIndex((b: any) => b.id === id);

    if (brainIndex === -1) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    }

    const brain = data.brains[brainIndex];

    // Build context from brain data
    const contextParts: string[] = [];

    if (brain.email_sources?.length > 0) {
      contextParts.push(`Email sources being tracked: ${brain.email_sources.join(", ")}`);
    }

    // Get cached emails that match brain sources
    const cacheKey = `email:inbox:${user.profile}:all`;
    const cachedEmails = await redis.get(cacheKey) as any[] | null;
    if (cachedEmails && brain.email_sources?.length > 0) {
      const matchingEmails = cachedEmails.filter((e: any) =>
        brain.email_sources.some((source: string) =>
          e.from?.includes(source)
        )
      );
      if (matchingEmails.length > 0) {
        contextParts.push(`\nRecent emails from tracked sources (${matchingEmails.length}):`);
        matchingEmails.slice(0, 15).forEach((e: any, i: number) => {
          contextParts.push(`${i + 1}. From: ${e.from} | Subject: ${e.subject} | Date: ${e.date}\n   ${e.snippet?.substring(0, 150) || ""}`);
        });
      }
    }

    if (brain.notes?.length > 0) {
      contextParts.push(`\nManual notes:`);
      brain.notes.forEach((n: any) => contextParts.push(`- ${n.content}`));
    }

    if (brain.links?.length > 0) {
      contextParts.push(`\nSaved links:`);
      brain.links.forEach((l: any) => contextParts.push(`- ${l.title || l.url}: ${l.url}`));
    }

    if (brain.documents?.length > 0) {
      contextParts.push(`\nUploaded documents:`);
      brain.documents.forEach((d: any) => contextParts.push(`- ${d.name} (${d.content?.substring(0, 200) || "binary file"})`));
    }

    // Previous summaries for continuity
    if (brain.summaries?.length > 0) {
      const lastSummary = brain.summaries[brain.summaries.length - 1];
      contextParts.push(`\nPrevious summary (${lastSummary.date}):\n${lastSummary.content?.substring(0, 500)}`);
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Generate a comprehensive summary for the "${brain.name}" brain (${brain.description}).

Context:
${contextParts.join("\n")}

Create a well-structured summary that includes:
1. **Key Updates** — What's new or changed since the last summary
2. **Action Items** — Things that need attention or follow-up
3. **Insights** — Patterns, trends, or notable observations
4. **Status** — Overall state of this topic/project

Be concise but thorough. Use markdown formatting.`,
        },
      ],
    });

    const summaryContent =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Save summary to brain
    if (!brain.summaries) brain.summaries = [];
    brain.summaries.push({
      date: new Date().toISOString(),
      content: summaryContent,
    });

    // Keep last 20 summaries
    if (brain.summaries.length > 20) {
      brain.summaries = brain.summaries.slice(-20);
    }

    brain.lastUpdated = new Date().toISOString();
    data.brains[brainIndex] = brain;
    await redis.set(getBrainsKey(user.profile), data);

    return NextResponse.json({
      success: true,
      summary: {
        date: brain.summaries[brain.summaries.length - 1].date,
        content: summaryContent,
        preview: summaryContent.substring(0, 200) + "...",
      },
    });
  } catch (error: any) {
    console.error("Error generating summary:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}
