import { getRedis, REDIS_KEYS, type MemoryEntry } from "@/lib/redis";

// GET /api/memory?date=YYYY-MM-DD&project=id&tag=name&author=name&type=note&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const projectId = searchParams.get("project");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tag = searchParams.get("tag");
    const author = searchParams.get("author");
    const type = searchParams.get("type");
    const profile = request.headers.get("x-user-profile") || "erik";

    const redis = getRedis();

    let entries: MemoryEntry[] = [];

    if (date) {
      // Single date lookup
      const dayEntries = await redis.get<MemoryEntry[]>(
        REDIS_KEYS.memoryEntries(date)
      );
      entries = dayEntries || [];
    } else if (projectId) {
      // Project-specific entries
      const entryIds = await redis.smembers(
        REDIS_KEYS.memoryByProject(projectId)
      );
      if (entryIds.length > 0) {
        const pipeline = redis.pipeline();
        for (const id of entryIds) {
          pipeline.get(REDIS_KEYS.memoryEntry(id));
        }
        const results = await pipeline.exec<(MemoryEntry | null)[]>();
        entries = results.filter((e): e is MemoryEntry => e !== null);
      }
    } else {
      // Load all dates for profile, optionally filtered by range
      const allDates = await redis.smembers(REDIS_KEYS.memoryDates(profile));
      let datesToLoad = allDates.sort().reverse();

      if (from) {
        datesToLoad = datesToLoad.filter((d) => d >= from);
      }
      if (to) {
        datesToLoad = datesToLoad.filter((d) => d <= to);
      }

      // Limit to 90 days max
      datesToLoad = datesToLoad.slice(0, 90);

      if (datesToLoad.length > 0) {
        const pipeline = redis.pipeline();
        for (const d of datesToLoad) {
          pipeline.get(REDIS_KEYS.memoryEntries(d));
        }
        const results = await pipeline.exec<(MemoryEntry[] | null)[]>();
        for (const dayEntries of results) {
          if (dayEntries) entries.push(...dayEntries);
        }
      }
    }

    // Apply filters
    if (tag) {
      entries = entries.filter((e) =>
        e.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
      );
    }
    if (author) {
      entries = entries.filter(
        (e) => e.author.toLowerCase() === author.toLowerCase()
      );
    }
    if (type) {
      entries = entries.filter((e) => e.type === type);
    }

    // Sort newest first
    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Get all dates that have entries (for calendar indicators)
    const datesWithEntries = await redis.smembers(
      REDIS_KEYS.memoryDates(profile)
    );

    // Get all tags
    const allTags = await redis.smembers(REDIS_KEYS.memoryTags(profile));

    return Response.json({
      entries,
      datesWithEntries: datesWithEntries.sort().reverse(),
      tags: allTags.sort(),
    });
  } catch (error: any) {
    console.error("Memory GET error:", error);
    return Response.json(
      { error: "Failed to load memory entries", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/memory - Create new entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = request.headers.get("x-user-profile") || "erik";
    const userName = request.headers.get("x-user-name") || "Erik";

    if (!body.title?.trim()) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    const now = new Date();
    const date = body.date || now.toISOString().split("T")[0];
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const entry: MemoryEntry = {
      id,
      date,
      timestamp: body.timestamp || now.toISOString(),
      title: body.title.trim(),
      content: body.content?.trim() || "",
      author: body.author || userName,
      profile: (body.profile as "erik" | "anton") || (profile as "erik" | "anton"),
      projectIds: body.projectIds || [],
      tags: body.tags || [],
      type: body.type || "note",
    };

    const redis = getRedis();

    // Store individual entry
    await redis.set(REDIS_KEYS.memoryEntry(id), entry);

    // Add to date bucket
    const existing = await redis.get<MemoryEntry[]>(
      REDIS_KEYS.memoryEntries(date)
    );
    const dayEntries = existing || [];
    dayEntries.push(entry);
    await redis.set(REDIS_KEYS.memoryEntries(date), dayEntries);

    // Track date in profile's date set
    await redis.sadd(REDIS_KEYS.memoryDates(profile), date);

    // Index by project
    for (const pid of entry.projectIds) {
      await redis.sadd(REDIS_KEYS.memoryByProject(pid), id);
    }

    // Track tags
    for (const tag of entry.tags) {
      await redis.sadd(REDIS_KEYS.memoryTags(profile), tag);
    }

    return Response.json({ entry }, { status: 201 });
  } catch (error: any) {
    console.error("Memory POST error:", error);
    return Response.json(
      { error: "Failed to create entry", details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/memory - Update entry
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const profile = request.headers.get("x-user-profile") || "erik";

    if (!body.id) {
      return Response.json({ error: "Entry ID is required" }, { status: 400 });
    }

    const redis = getRedis();
    const existing = await redis.get<MemoryEntry>(
      REDIS_KEYS.memoryEntry(body.id)
    );
    if (!existing) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }

    const oldProjectIds = existing.projectIds;

    // Update fields
    const updated: MemoryEntry = {
      ...existing,
      title: body.title?.trim() ?? existing.title,
      content: body.content?.trim() ?? existing.content,
      projectIds: body.projectIds ?? existing.projectIds,
      tags: body.tags ?? existing.tags,
      type: body.type ?? existing.type,
    };

    // Save individual entry
    await redis.set(REDIS_KEYS.memoryEntry(body.id), updated);

    // Update date bucket
    const dayEntries = await redis.get<MemoryEntry[]>(
      REDIS_KEYS.memoryEntries(existing.date)
    );
    if (dayEntries) {
      const idx = dayEntries.findIndex((e) => e.id === body.id);
      if (idx !== -1) {
        dayEntries[idx] = updated;
        await redis.set(REDIS_KEYS.memoryEntries(existing.date), dayEntries);
      }
    }

    // Update project indexes
    for (const pid of oldProjectIds) {
      if (!updated.projectIds.includes(pid)) {
        await redis.srem(REDIS_KEYS.memoryByProject(pid), body.id);
      }
    }
    for (const pid of updated.projectIds) {
      await redis.sadd(REDIS_KEYS.memoryByProject(pid), body.id);
    }

    // Update tags
    for (const tag of updated.tags) {
      await redis.sadd(REDIS_KEYS.memoryTags(profile), tag);
    }

    return Response.json({ entry: updated });
  } catch (error: any) {
    console.error("Memory PUT error:", error);
    return Response.json(
      { error: "Failed to update entry", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/memory?id=xxx
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const profile = request.headers.get("x-user-profile") || "erik";

    if (!id) {
      return Response.json({ error: "Entry ID is required" }, { status: 400 });
    }

    const redis = getRedis();
    const entry = await redis.get<MemoryEntry>(REDIS_KEYS.memoryEntry(id));
    if (!entry) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }

    // Remove from date bucket
    const dayEntries = await redis.get<MemoryEntry[]>(
      REDIS_KEYS.memoryEntries(entry.date)
    );
    if (dayEntries) {
      const filtered = dayEntries.filter((e) => e.id !== id);
      if (filtered.length > 0) {
        await redis.set(REDIS_KEYS.memoryEntries(entry.date), filtered);
      } else {
        await redis.del(REDIS_KEYS.memoryEntries(entry.date));
        await redis.srem(REDIS_KEYS.memoryDates(profile), entry.date);
      }
    }

    // Remove from project indexes
    for (const pid of entry.projectIds) {
      await redis.srem(REDIS_KEYS.memoryByProject(pid), id);
    }

    // Remove individual entry
    await redis.del(REDIS_KEYS.memoryEntry(id));

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Memory DELETE error:", error);
    return Response.json(
      { error: "Failed to delete entry", details: error.message },
      { status: 500 }
    );
  }
}
