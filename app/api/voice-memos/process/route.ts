import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { getRedis } from "@/lib/redis";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Load clients and projects for matching
function loadClientsAndProjects() {
  try {
    const clientsPath = path.join(process.cwd(), "data", "clients.yaml");
    const projectsPath = path.join(process.cwd(), "data", "projects.yaml");

    const clientsRaw = fs.readFileSync(clientsPath, "utf-8");
    const projectsRaw = fs.readFileSync(projectsPath, "utf-8");

    const clients = (yaml.load(clientsRaw) as any)?.clients || [];
    const projects = (yaml.load(projectsRaw) as any)?.projects || [];

    return { clients, projects };
  } catch {
    return { clients: [], projects: [] };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth: accept session cookie OR bot token
    const authHeader = request.headers.get("authorization") || "";
    const botToken = process.env.AGIS_BOT_TOKEN || "agis-bot-secure-token-2026";

    if (authHeader !== `Bearer ${botToken}`) {
      const { getSessionUserFromRequest } = await import("@/lib/auth");
      const user = await getSessionUserFromRequest(request);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { memoId, filename, date, filePath, fileSize, transcript } =
      await request.json();

    if (!transcript || !memoId) {
      return Response.json(
        { error: "transcript and memoId are required" },
        { status: 400 }
      );
    }

    // Load clients and projects for matching context
    const { clients, projects } = loadClientsAndProjects();

    const clientList = clients
      .map((c: any) => `${c.name} (${c.id})`)
      .join(", ");
    const projectList = projects
      .slice(0, 50)
      .map((p: any) => `${p.name} [client: ${p.clientId}] (${p.id})`)
      .join(", ");

    // AI analysis of the transcript
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Analyze this voice memo transcript and extract structured information. Return ONLY valid JSON.

Transcript:
"${transcript.substring(0, 8000)}"

Known clients: ${clientList.substring(0, 2000)}
Known projects: ${projectList.substring(0, 2000)}

Return JSON with these fields:
{
  "title": "A descriptive title for this recording (5-10 words)",
  "type": "business" or "personal",
  "speakers": "Comma-separated list of speaker names mentioned or identified",
  "summary": "2-3 sentence summary of what was discussed",
  "topics": ["array", "of", "key", "topics"],
  "actionItems": ["array of action items or next steps mentioned"],
  "clientMatch": "matching client ID from the known clients list, or null if no match",
  "projectMatch": "matching project ID from the known projects list, or null if no match",
  "sentiment": "positive, neutral, or negative",
  "keyDecisions": ["any decisions that were made"],
  "mentionedPeople": ["names of people mentioned"]
}

Be accurate with client/project matching — only match if clearly discussed. Return ONLY the JSON object.`,
        },
      ],
    });

    const aiText =
      message.content[0].type === "text" ? message.content[0].text : "{}";

    let analysis: any;
    try {
      analysis = JSON.parse(aiText);
    } catch {
      analysis = {
        title: `Recording ${filename}`,
        type: "personal",
        speakers: "Unknown",
        summary: transcript.substring(0, 200),
        topics: [],
        actionItems: [],
        clientMatch: null,
        projectMatch: null,
        sentiment: "neutral",
        keyDecisions: [],
        mentionedPeople: [],
      };
    }

    // Build the processed memo object
    const processedMemo = {
      id: memoId,
      title: analysis.title || `Recording ${filename}`,
      date: date || new Date().toISOString(),
      type: analysis.type || "personal",
      speakers: analysis.speakers || "Unknown",
      projectMatch: analysis.projectMatch || analysis.clientMatch || null,
      clientMatch: analysis.clientMatch || null,
      summary: analysis.summary || "",
      notionUrl: "",
      topics: analysis.topics || [],
      actionItems: analysis.actionItems || [],
      transcript,
      sentiment: analysis.sentiment || "neutral",
      keyDecisions: analysis.keyDecisions || [],
      mentionedPeople: analysis.mentionedPeople || [],
      filePath: filePath || "",
      fileSize: fileSize || 0,
      source: "processed-local",
      processedAt: new Date().toISOString(),
    };

    // Save to Redis
    const redis = getRedis();
    const key = "voice-memos:processed";
    const existing = ((await redis.get(key)) as any[]) || [];

    // Replace if exists, otherwise add
    const idx = existing.findIndex((m: any) => m.id === memoId);
    if (idx >= 0) {
      existing[idx] = processedMemo;
    } else {
      existing.push(processedMemo);
    }

    await redis.set(key, existing);

    // If matched to a client/project, also update the brain if one exists
    if (analysis.clientMatch || analysis.projectMatch) {
      try {
        const brainsData = (await redis.get("brains:erik")) as any;
        if (brainsData?.brains) {
          const matchId = analysis.projectMatch || analysis.clientMatch;
          const brain = brainsData.brains.find(
            (b: any) =>
              b.id === matchId ||
              b.name.toLowerCase().includes((matchId || "").toLowerCase())
          );
          if (brain) {
            if (!brain.notes) brain.notes = [];
            brain.notes.push({
              content: `[Voice Memo ${new Date(date).toLocaleDateString()}] ${analysis.summary}\n\nAction Items:\n${(analysis.actionItems || []).map((a: string) => `- ${a}`).join("\n")}`,
              date: new Date().toISOString(),
              source: "voice-memo",
            });
            brain.lastUpdated = new Date().toISOString();
            await redis.set("brains:erik", brainsData);
          }
        }
      } catch {
        // Brain update is optional, don't fail the whole request
      }
    }

    return Response.json({
      success: true,
      memo: processedMemo,
    });
  } catch (error: any) {
    console.error("Voice memo processing error:", error);
    return Response.json(
      { error: error.message || "Failed to process voice memo" },
      { status: 500 }
    );
  }
}
