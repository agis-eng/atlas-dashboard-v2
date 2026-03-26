import { NextResponse } from "next/server";
import { getRedis, REDIS_KEYS, type MemoryEntry } from "@/lib/redis";

function summarizeDay(date: string, entries: MemoryEntry[]) {
  const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const projectCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const entry of entries) {
    entry.projectIds.forEach((projectId) => projectCounts.set(projectId, (projectCounts.get(projectId) || 0) + 1));
    entry.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
  }

  const topProjects = [...projectCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([projectId]) => projectId);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag);
  const events = sorted.slice(0, 4).map((entry) => ({
    title: entry.title,
    time: new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    type: entry.type,
  }));
  const openLoops = sorted
    .filter((entry) => /open loop|follow-up|todo|next step|pending/i.test(`${entry.title} ${entry.content}`))
    .slice(0, 5)
    .map((entry) => entry.title);

  const highlights = sorted.slice(0, 3).map((entry) => entry.title);

  return {
    date,
    title: `Memory summary for ${date}`,
    summary: highlights.join(" • "),
    highlights,
    topProjects,
    topTags,
    events,
    openLoops,
    stats: {
      events: entries.length,
      heartbeats: entries.filter((entry) => /heartbeat/i.test(entry.title) || entry.tags.includes("heartbeat")).length,
      openLoops: openLoops.length,
      decisions: entries.filter((entry) => entry.type === "decision").length,
      discussions: entries.filter((entry) => entry.type === "discussion").length,
      updates: entries.filter((entry) => entry.type === "update").length,
    },
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const profile = request.headers.get("x-user-profile") || "erik";

    const redis = getRedis();
    const allDates = await redis.smembers(REDIS_KEYS.memoryDates(profile));
    const dates = allDates.sort().reverse().slice(0, limit);

    if (dates.length === 0) {
      return NextResponse.json({ summaries: [] });
    }

    const pipeline = redis.pipeline();
    dates.forEach((date) => pipeline.get(REDIS_KEYS.memoryEntries(date)));
    const results = await pipeline.exec<(MemoryEntry[] | null)[]>();

    const summaries = dates.map((date, index) => {
      const entries = results[index] || [];
      return summarizeDay(date, entries || []);
    }).filter((summary) => summary.stats.events > 0);

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("Error building daily summaries:", error);
    return NextResponse.json(
      { error: "Failed to read daily summaries" },
      { status: 500 }
    );
  }
}
