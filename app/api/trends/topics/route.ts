import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

const TOPICS_PATH = join(process.cwd(), "data", "trends-topics.yaml");

interface Topic {
  id: string;
  name: string;
  keywords: string[];
  platforms: ("x" | "reddit" | "youtube")[];
  active: boolean;
}

async function loadTopics(): Promise<{ topics: Topic[] }> {
  try {
    const contents = await readFile(TOPICS_PATH, "utf8");
    return (yaml.load(contents) as { topics: Topic[] }) || { topics: [] };
  } catch {
    return { topics: [] };
  }
}

async function saveTopics(data: { topics: Topic[] }) {
  const yamlStr = yaml.dump(data, { lineWidth: -1, noRefs: true });
  await writeFile(TOPICS_PATH, yamlStr, "utf8");
}

export async function GET() {
  const data = await loadTopics();
  return Response.json({ topics: data.topics || [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, keywords, platforms } = body;

  if (!name || !keywords?.length || !platforms?.length) {
    return Response.json({ error: "name, keywords, and platforms are required" }, { status: 400 });
  }

  const data = await loadTopics();
  const newTopic: Topic = {
    id: `topic_${Date.now()}`,
    name,
    keywords: Array.isArray(keywords) ? keywords : [keywords],
    platforms,
    active: true,
  };
  data.topics.push(newTopic);
  await saveTopics(data);
  return Response.json({ topic: newTopic });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const data = await loadTopics();
  const idx = data.topics.findIndex((t) => t.id === id);
  if (idx === -1) {
    return Response.json({ error: "Topic not found" }, { status: 404 });
  }

  data.topics[idx] = { ...data.topics[idx], ...updates };
  await saveTopics(data);
  return Response.json({ topic: data.topics[idx] });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const data = await loadTopics();
  data.topics = data.topics.filter((t) => t.id !== id);
  await saveTopics(data);
  return Response.json({ success: true });
}
