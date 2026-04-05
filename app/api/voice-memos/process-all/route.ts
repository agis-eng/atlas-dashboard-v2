import { NextRequest } from "next/server";
import fs from "fs";
import { readFile, unlink } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getRedis } from "@/lib/redis";

const ICLOUD_JPR_PATH = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/iCloud~com~openplanetsoftware~just-press-record/Documents"
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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

function scanUnprocessedRecordings(knownIds: Set<string>) {
  const recordings: Array<{
    id: string;
    filename: string;
    date: string;
    filePath: string;
    fileSize: number;
  }> = [];

  try {
    if (!fs.existsSync(ICLOUD_JPR_PATH)) return recordings;

    const dateDirs = fs.readdirSync(ICLOUD_JPR_PATH).filter((d) => {
      const full = path.join(ICLOUD_JPR_PATH, d);
      return fs.statSync(full).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d);
    });

    for (const dateDir of dateDirs) {
      const dirPath = path.join(ICLOUD_JPR_PATH, dateDir);
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".m4a"));

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        const id = `jpr-${dateDir}-${file.replace(".m4a", "")}`;

        if (!knownIds.has(id)) {
          recordings.push({
            id,
            filename: file,
            date: `${dateDir}T${file.replace(".m4a", "").replace(/-/g, ":")}`,
            filePath,
            fileSize: stats.size,
          });
        }
      }
    }
  } catch {
    // iCloud folder not accessible
  }

  return recordings;
}

async function transcribeAudio(filePath: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for audio transcription. Add it to your .env.local file."
    );
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const audioFile = await readFile(filePath);
  const file = new File([audioFile], path.basename(filePath), {
    type: "audio/m4a",
  });

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "text",
  });

  return transcription as unknown as string;
}

async function analyzeTranscript(
  transcript: string,
  clientList: string,
  projectList: string
) {
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

  try {
    return JSON.parse(aiText);
  } catch {
    return {
      title: "Voice Recording",
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
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get already-processed memo IDs
    const redis = getRedis();
    const processedKey = "voice-memos:processed";
    const existingMemos = ((await redis.get(processedKey)) as any[]) || [];
    const knownIds = new Set(existingMemos.map((m: any) => m.id));

    // Also check YAML memos
    try {
      const yamlPath = path.join(process.cwd(), "data", "voice_memos.yaml");
      const raw = fs.readFileSync(yamlPath, "utf-8");
      const parsed = yaml.load(raw) as any;
      for (const m of parsed?.voice_memos || []) {
        knownIds.add(m.id);
      }
    } catch {
      // YAML might not exist
    }

    // Find unprocessed recordings
    const unprocessed = scanUnprocessedRecordings(knownIds);

    if (unprocessed.length === 0) {
      return Response.json({
        success: true,
        processed: 0,
        message: "No new recordings to process",
      });
    }

    // Load context for AI matching
    const { clients, projects } = loadClientsAndProjects();
    const clientList = clients
      .map((c: any) => `${c.name} (${c.id})`)
      .join(", ");
    const projectList = projects
      .slice(0, 50)
      .map((p: any) => `${p.name} [client: ${p.clientId}] (${p.id})`)
      .join(", ");

    const results: Array<{ id: string; title: string; status: string; error?: string }> = [];

    // Process each recording sequentially
    for (const recording of unprocessed) {
      try {
        // Step 1: Transcribe
        const transcript = await transcribeAudio(recording.filePath);

        if (!transcript || transcript.trim().length === 0) {
          results.push({
            id: recording.id,
            title: recording.filename,
            status: "skipped",
            error: "Empty transcript",
          });
          continue;
        }

        // Step 2: AI analysis
        const analysis = await analyzeTranscript(
          transcript,
          clientList,
          projectList
        );

        // Step 3: Build processed memo
        const processedMemo = {
          id: recording.id,
          title: analysis.title || `Recording ${recording.filename}`,
          date: recording.date || new Date().toISOString(),
          type: analysis.type || "personal",
          speakers: analysis.speakers || "Unknown",
          projectMatch:
            analysis.projectMatch || analysis.clientMatch || null,
          clientMatch: analysis.clientMatch || null,
          summary: analysis.summary || "",
          notionUrl: "",
          topics: analysis.topics || [],
          actionItems: analysis.actionItems || [],
          transcript,
          sentiment: analysis.sentiment || "neutral",
          keyDecisions: analysis.keyDecisions || [],
          mentionedPeople: analysis.mentionedPeople || [],
          filePath: recording.filePath,
          fileSize: recording.fileSize,
          source: "processed-local",
          processedAt: new Date().toISOString(),
        };

        // Step 4: Save to Redis
        existingMemos.push(processedMemo);
        await redis.set(processedKey, existingMemos);

        // Step 5: Delete the iCloud file
        try {
          await unlink(recording.filePath);
          console.log(`Deleted iCloud recording: ${recording.filePath}`);
        } catch {
          console.error(
            `Failed to delete iCloud recording: ${recording.filePath}`
          );
        }

        // Step 6: Update brain if matched
        if (analysis.clientMatch || analysis.projectMatch) {
          try {
            const brainsData = (await redis.get("brains:erik")) as any;
            if (brainsData?.brains) {
              const matchId =
                analysis.projectMatch || analysis.clientMatch;
              const brain = brainsData.brains.find(
                (b: any) =>
                  b.id === matchId ||
                  b.name
                    .toLowerCase()
                    .includes((matchId || "").toLowerCase())
              );
              if (brain) {
                if (!brain.notes) brain.notes = [];
                brain.notes.push({
                  content: `[Voice Memo ${new Date(recording.date).toLocaleDateString()}] ${analysis.summary}\n\nAction Items:\n${(analysis.actionItems || []).map((a: string) => `- ${a}`).join("\n")}`,
                  date: new Date().toISOString(),
                  source: "voice-memo",
                });
                brain.lastUpdated = new Date().toISOString();
                await redis.set("brains:erik", brainsData);
              }
            }
          } catch {
            // Brain update is optional
          }
        }

        results.push({
          id: recording.id,
          title: analysis.title || recording.filename,
          status: "processed",
        });
      } catch (err: any) {
        console.error(
          `Failed to process recording ${recording.id}:`,
          err
        );
        results.push({
          id: recording.id,
          title: recording.filename,
          status: "error",
          error: err.message || "Processing failed",
        });
      }
    }

    const processed = results.filter((r) => r.status === "processed").length;
    const errors = results.filter((r) => r.status === "error").length;

    return Response.json({
      success: true,
      processed,
      errors,
      total: unprocessed.length,
      results,
    });
  } catch (error: any) {
    console.error("Process all voice memos error:", error);
    return Response.json(
      { error: error.message || "Failed to process voice memos" },
      { status: 500 }
    );
  }
}
