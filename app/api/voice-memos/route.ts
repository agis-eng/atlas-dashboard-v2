import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

interface VoiceMemoYaml {
  id: string;
  title: string;
  date: string;
  type: string;
  speakers: string;
  project_match: string | null;
  summary: string;
  notion_url: string;
  topics: string[];
  action_items: string[];
}

// iCloud Drive path for Just Press Record
const ICLOUD_JPR_PATH = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/iCloud~com~openplanetsoftware~just-press-record/Documents"
);

function scanICloudRecordings(): Array<{
  id: string;
  title: string;
  date: string;
  type: string;
  speakers: string;
  projectMatch: null;
  summary: string;
  notionUrl: string;
  topics: string[];
  actionItems: string[];
  filePath: string;
  source: "icloud";
}> {
  const recordings: any[] = [];

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
        const title = file.replace(".m4a", "").replace(/-/g, ":");
        const id = `jpr-${dateDir}-${file.replace(".m4a", "")}`;

        recordings.push({
          id,
          title: title.includes(":") ? `Recording ${dateDir} ${title}` : title,
          date: stats.mtime.toISOString(),
          type: "personal",
          speakers: "Unknown",
          projectMatch: null,
          summary: `Voice recording from Just Press Record (${(stats.size / 1024).toFixed(0)} KB)`,
          notionUrl: "",
          topics: [],
          actionItems: [],
          filePath,
          fileSize: stats.size,
          source: "icloud",
        });
      }
    }
  } catch {
    // iCloud folder not accessible (e.g., on Vercel) — silent
  }

  return recordings;
}

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load processed memos from YAML
    const filePath = path.join(process.cwd(), "data", "voice_memos.yaml");
    let yamlMemos: any[] = [];
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = yaml.load(raw) as { voice_memos: VoiceMemoYaml[] };
      yamlMemos = (parsed.voice_memos || []).map((m) => ({
        id: m.id,
        title: m.title,
        date: m.date,
        type: m.type,
        speakers: m.speakers,
        projectMatch: m.project_match,
        summary: m.summary,
        notionUrl: m.notion_url,
        topics: m.topics || [],
        actionItems: m.action_items || [],
        source: "processed",
      }));
    } catch {
      // YAML file might not exist
    }

    // Load AI-processed memos from Redis
    const { getRedis } = await import("@/lib/redis");
    const redis = getRedis();
    const processedMemos = ((await redis.get("voice-memos:processed")) as any[]) || [];

    // Scan iCloud Drive for new recordings
    const icloudMemos = scanICloudRecordings();

    // Build a set of all known IDs (YAML + processed)
    const knownIds = new Set([
      ...yamlMemos.map((m) => m.id),
      ...processedMemos.map((m: any) => m.id),
    ]);

    // iCloud recordings not yet processed or in YAML
    const newRecordings = icloudMemos.filter((r) => !knownIds.has(r.id));

    // Merge all sources: processed first (richest data), then YAML, then raw iCloud
    const allMemos = [
      ...processedMemos.map((m: any) => ({ ...m, source: "processed-local" })),
      ...yamlMemos,
      ...newRecordings,
    ].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduped = allMemos.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return Response.json({ memos: deduped });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
