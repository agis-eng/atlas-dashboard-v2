import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { unlink } from "fs/promises";
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
    // Sanitize transcript for prompt (remove problematic chars)
    const cleanTranscript = transcript
      .substring(0, 8000)
      .replace(/\\/g, "")
      .replace(/`/g, "'");

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `You are an expert at analyzing voice memo transcripts. Analyze this recording and extract detailed, structured information. Return ONLY valid JSON.

<transcript>
${cleanTranscript}
</transcript>

Known clients: ${clientList.substring(0, 2000)}
Known projects: ${projectList.substring(0, 2000)}

## Speaker Identification Instructions
- Try to identify speakers by name from context clues (introductions, greetings, references to each other, voice cues like "I'm [name]", "hey [name]", etc.)
- If the recording is a single person, try to identify who it is from the content and context (e.g., if they mention "my project" and it matches a known project owner)
- Known people: Erik Laine (owner/founder), Anton (developer/partner). If the content suggests one of them, name them.
- For unknown speakers, use descriptive labels like "Speaker 1 (male voice)", "Speaker 2 (female, client)" etc.
- Note how many distinct speakers you detect

## Summary Instructions
- Write a comprehensive 3-5 sentence summary that captures the KEY substance of the conversation
- Include specific details: names, numbers, dates, decisions, and outcomes mentioned
- Explain the context and purpose of the conversation (e.g., "client onboarding call", "internal planning session", "personal reminder")
- Note the tone and dynamic of the conversation

Return JSON with these fields:
{
  "title": "A specific, descriptive title (5-12 words) that captures what this is about",
  "type": "business" or "personal",
  "speakers": "Named speakers with roles, e.g. 'Erik Laine (founder), John Smith (client from Acme Corp)' — be as specific as possible",
  "speakerCount": number of distinct speakers detected,
  "summary": "Comprehensive 3-5 sentence summary with specific details, names, numbers, and context",
  "topics": ["specific", "descriptive", "topics"],
  "actionItems": ["specific action items with who is responsible if mentioned"],
  "clientMatch": "matching client ID from the known clients list, or null if no match",
  "projectMatch": "matching project ID from the known projects list, or null if no match",
  "sentiment": "positive, neutral, or negative",
  "keyDecisions": ["specific decisions that were made with context"],
  "mentionedPeople": ["full names of people mentioned with brief context, e.g. 'John Smith (potential client)'"]
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

    // Delete the original iCloud recording if it exists
    if (filePath && filePath.includes("iCloud") && fs.existsSync(filePath)) {
      try {
        await unlink(filePath);
        console.log(`Deleted iCloud recording: ${filePath}`);
      } catch (delErr) {
        console.error("Failed to delete iCloud recording:", delErr);
      }
    }

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
