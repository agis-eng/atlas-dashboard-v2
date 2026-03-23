import { getRedis, REDIS_KEYS, type MemoryEntry } from "@/lib/redis";

// GET /api/memory/search?q=keyword&limit=20
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase().trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const profile = request.headers.get("x-user-profile") || "erik";

    if (!query) {
      return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
    }

    const redis = getRedis();

    // Get all dates for this profile
    const allDates = await redis.smembers(REDIS_KEYS.memoryDates(profile));
    const sortedDates = allDates.sort().reverse();

    const matches: MemoryEntry[] = [];
    const keywords = query.split(/\s+/).filter(Boolean);

    // Search through entries date by date (newest first)
    for (const date of sortedDates) {
      if (matches.length >= limit) break;

      const dayEntries = await redis.get<MemoryEntry[]>(
        REDIS_KEYS.memoryEntries(date)
      );
      if (!dayEntries) continue;

      for (const entry of dayEntries) {
        if (matches.length >= limit) break;

        const searchText = [
          entry.title,
          entry.content,
          entry.author,
          entry.type,
          ...entry.tags,
        ]
          .join(" ")
          .toLowerCase();

        // All keywords must match
        if (keywords.every((kw) => searchText.includes(kw))) {
          matches.push(entry);
        }
      }
    }

    return Response.json({ entries: matches, total: matches.length });
  } catch (error: any) {
    console.error("Memory search error:", error);
    return Response.json(
      { error: "Search failed", details: error.message },
      { status: 500 }
    );
  }
}
