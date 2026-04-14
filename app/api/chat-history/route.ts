import { getRedis, REDIS_KEYS, type ChatMessage, type ChatSession } from "@/lib/redis";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");
    const profile = searchParams.get("profile") || "erik";

    const redis = getRedis();

    // If sessionId provided, return messages for that session
    if (sessionId) {
      const rawMessages = await redis.lrange(REDIS_KEYS.chatMessages(sessionId), 0, -1);
      const messages: ChatMessage[] = rawMessages.map((m) =>
        typeof m === "string" ? JSON.parse(m) : m
      );
      return Response.json({ messages });
    }

    // Otherwise, return session list for profile
    let sessionIds: string[] = [];
    try {
      sessionIds = await redis.smembers(REDIS_KEYS.chatSessions(profile)) as string[];
    } catch {
      try {
        sessionIds = await redis.lrange(REDIS_KEYS.chatSessions(profile), 0, 49) as string[];
      } catch {
        sessionIds = [];
      }
    }

    const sessions: ChatSession[] = [];

    for (const id of sessionIds) {
      const meta = await redis.get(REDIS_KEYS.chatSessionMeta(id as string));
      if (meta) {
        sessions.push(typeof meta === "string" ? JSON.parse(meta) : meta);
      }
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return Response.json({ sessions: sessions.slice(0, 50) });
  } catch (error) {
    console.error("Chat history error:", error);
    // Return empty data instead of 500 so the UI doesn't break
    return Response.json({ sessions: [], messages: [] });
  }
}
