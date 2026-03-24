import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const TOPICS_KEY = "trends:topics";

interface Topic {
  id: string;
  name: string;
  keywords: string[];
  platforms: ("x" | "reddit" | "youtube")[];
  active: boolean;
}

async function loadTopics(): Promise<{ topics: Topic[] }> {
  const redis = getRedis();
  const data = await redis.get(TOPICS_KEY);
  
  if (!data || typeof data !== 'object') {
    return { topics: [] };
  }
  
  return data as { topics: Topic[] };
}

async function saveTopics(data: { topics: Topic[] }) {
  const redis = getRedis();
  await redis.set(TOPICS_KEY, data);
}

export async function GET() {
  const data = await loadTopics();
  return NextResponse.json({ topics: data.topics || [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, keywords, platforms } = body;

  if (!name || !keywords?.length || !platforms?.length) {
    return NextResponse.json({ error: "name, keywords, and platforms are required" }, { status: 400 });
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
  return NextResponse.json({ topic: newTopic });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data = await loadTopics();
  const idx = data.topics.findIndex((t) => t.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  data.topics[idx] = { ...data.topics[idx], ...updates };
  await saveTopics(data);
  return NextResponse.json({ topic: data.topics[idx] });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data = await loadTopics();
  data.topics = data.topics.filter((t) => t.id !== id);
  await saveTopics(data);
  return NextResponse.json({ success: true });
}
