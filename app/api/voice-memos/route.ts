import { NextRequest } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
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

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const filePath = path.join(process.cwd(), "data", "voice_memos.yaml");
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = yaml.load(raw) as { voice_memos: VoiceMemoYaml[] };
    const memos = (parsed.voice_memos || []).map((m) => ({
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
    }));

    return Response.json({ memos });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
