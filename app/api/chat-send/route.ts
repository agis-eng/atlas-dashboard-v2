import { getRedis, REDIS_KEYS, type ChatMessage, type ChatSession } from "@/lib/redis";

export async function POST(request: Request) {
  try {
    const { message, sessionId, profile = "erik" } = await request.json();

    if (!message || !sessionId) {
      return Response.json({ error: "Missing message or sessionId" }, { status: 400 });
    }

    const redis = getRedis();

    // Store user message
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: message,
      timestamp: Date.now(),
      sessionId,
    };

    await redis.rpush(REDIS_KEYS.chatMessages(sessionId), JSON.stringify(userMsg));

    // Update or create session metadata
    const sessionMeta: ChatSession = {
      id: sessionId,
      title: message.slice(0, 50),
      profile,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    };

    // Check if session exists
    const existing = await redis.get(REDIS_KEYS.chatSessionMeta(sessionId));
    if (existing) {
      const parsed = typeof existing === "string" ? JSON.parse(existing) : existing;
      sessionMeta.title = parsed.title;
      sessionMeta.createdAt = parsed.createdAt;
      sessionMeta.messageCount = parsed.messageCount + 1;
    } else {
      // Add to session list
      await redis.lpush(REDIS_KEYS.chatSessions(profile), sessionId);
    }

    sessionMeta.updatedAt = Date.now();
    await redis.set(REDIS_KEYS.chatSessionMeta(sessionId), JSON.stringify(sessionMeta));

    return Response.json({ success: true, message: userMsg });
  } catch (error) {
    console.error("Chat send error:", error);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}
