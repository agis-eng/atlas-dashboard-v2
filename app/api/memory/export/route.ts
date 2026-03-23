import { getRedis, REDIS_KEYS, type MemoryEntry } from "@/lib/redis";

// GET /api/memory/export?format=markdown|json&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "markdown";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const profile = request.headers.get("x-user-profile") || "erik";

    const redis = getRedis();
    const allDates = await redis.smembers(REDIS_KEYS.memoryDates(profile));
    let datesToExport = allDates.sort();

    if (from) datesToExport = datesToExport.filter((d) => d >= from);
    if (to) datesToExport = datesToExport.filter((d) => d <= to);

    const allEntries: MemoryEntry[] = [];
    if (datesToExport.length > 0) {
      const pipeline = redis.pipeline();
      for (const d of datesToExport) {
        pipeline.get(REDIS_KEYS.memoryEntries(d));
      }
      const results = await pipeline.exec<(MemoryEntry[] | null)[]>();
      for (const dayEntries of results) {
        if (dayEntries) allEntries.push(...dayEntries);
      }
    }

    allEntries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (format === "json") {
      return new Response(JSON.stringify({ entries: allEntries }, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="memory-export-${from || "all"}-${to || "all"}.json"`,
        },
      });
    }

    // Markdown format
    let markdown = `# Memory Log\n\n`;
    if (from || to) {
      markdown += `**Period:** ${from || "beginning"} to ${to || "present"}\n\n`;
    }
    markdown += `**Exported:** ${new Date().toISOString()}\n\n---\n\n`;

    // Group by date
    const byDate = new Map<string, MemoryEntry[]>();
    for (const entry of allEntries) {
      const existing = byDate.get(entry.date) || [];
      existing.push(entry);
      byDate.set(entry.date, existing);
    }

    for (const [date, entries] of byDate) {
      const dateObj = new Date(date + "T12:00:00");
      const formatted = dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      markdown += `## ${formatted}\n\n`;

      for (const entry of entries) {
        const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const typeLabel = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
        markdown += `### ${entry.title}\n\n`;
        markdown += `**${time}** | ${typeLabel} | by ${entry.author}`;
        if (entry.tags.length > 0) {
          markdown += ` | Tags: ${entry.tags.join(", ")}`;
        }
        markdown += `\n\n`;
        if (entry.content) {
          markdown += `${entry.content}\n\n`;
        }
        markdown += `---\n\n`;
      }
    }

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="memory-export-${from || "all"}-${to || "all"}.md"`,
      },
    });
  } catch (error: any) {
    console.error("Memory export error:", error);
    return Response.json(
      { error: "Export failed", details: error.message },
      { status: 500 }
    );
  }
}
