import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const { date, file } = await request.json();

    if (!date || !file) {
      return Response.json({ error: "Missing date or file path" }, { status: 400 });
    }

    // Read memory file
    const content = await readFile(file, "utf8");

    // Extract title (first heading) and projects from content
    const lines = content.split("\n");
    const title = lines.find(l => l.startsWith("# "))?.replace("# ", "") || `Daily Summary - ${date}`;
    
    // Extract project mentions (look for project names in content)
    const projectIds: string[] = [];
    const projectMatches = content.match(/\*\*([A-Z][a-zA-Z\s]+)\*\*/g);
    if (projectMatches) {
      projectIds.push(...projectMatches.map(m => m.replace(/\*\*/g, "").toLowerCase().replace(/\s+/g, "-")));
    }

    // Extract tags from headings
    const tags: string[] = [];
    lines.forEach(line => {
      if (line.startsWith("## ")) {
        tags.push(line.replace("## ", "").toLowerCase());
      }
    });

    // Create memory entry
    const redis = getRedis();
    const entry = {
      id: `memory_${date}_auto`,
      date,
      timestamp: new Date(date).toISOString(),
      title,
      content,
      author: "system",
      profile: "all",
      projectIds: [...new Set(projectIds)], // Dedupe
      tags: [...new Set(tags)], // Dedupe
      type: "note" as const,
    };

    // Store in Redis
    await redis.set(REDIS_KEYS.memoryEntry(entry.id), entry);
    
    // Update date index (for all profiles)
    const dateKey = REDIS_KEYS.memoryDates("all");
    await redis.sadd(dateKey, date);

    // Update entries for this date
    const entriesKey = REDIS_KEYS.memoryEntries(date);
    await redis.sadd(entriesKey, entry.id);

    return Response.json({ success: true, entry });
  } catch (error: any) {
    console.error("Memory sync error:", error);
    return Response.json(
      { error: "Failed to sync memory", details: error.message },
      { status: 500 }
    );
  }
}
