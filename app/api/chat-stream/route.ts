import { getRedis, REDIS_KEYS, type ChatMessage } from "@/lib/redis";

const OPENCLAW_API_URL = process.env.OPENCLAW_API_URL;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

async function tryStoreMessage(sessionId: string, msg: ChatMessage) {
  try {
    const redis = getRedis();
    await redis.rpush(REDIS_KEYS.chatMessages(sessionId), JSON.stringify(msg));
  } catch (err) {
    console.warn("Redis storage failed (non-fatal):", err);
  }
}

async function tryUpdateSession(sessionId: string, profile: string, title: string) {
  try {
    const redis = getRedis();
    const sessionMeta = {
      id: sessionId,
      title,
      profile,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 1,
    };
    await redis.set(REDIS_KEYS.chatSessionMeta(sessionId), JSON.stringify(sessionMeta));
    await redis.sadd(REDIS_KEYS.chatSessions(profile), sessionId);
  } catch (err) {
    console.warn("Redis session update failed (non-fatal):", err);
  }
}

function sendSSE(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: string) {
  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
}

export async function POST(request: Request) {
  try {
    const { message, sessionId, profile = "erik" } = await request.json();

    if (!message || !sessionId) {
      return Response.json({ error: "Missing message or sessionId" }, { status: 400 });
    }

    if (!OPENCLAW_API_URL) {
      return Response.json({ error: "OPENCLAW_API_URL is not configured" }, { status: 503 });
    }

    // Store user message
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: message,
      timestamp: Date.now(),
      sessionId,
    };
    tryStoreMessage(sessionId, userMsg);
    tryUpdateSession(sessionId, profile, message.slice(0, 50));

    // Call OpenClaw HTTP API
    const apiResponse = await fetch(OPENCLAW_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });

    if (!apiResponse.ok || !apiResponse.body) {
      const errText = await apiResponse.text().catch(() => "Unknown error");
      return Response.json({ error: `OpenClaw API error: ${errText}` }, { status: 502 });
    }

    // Stream SSE chunks from the API response to the client
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const reader = apiResponse.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Parse SSE lines from upstream and forward content chunks
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();

              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullText += parsed.content;
                }
              } catch {
                // Not JSON — forward raw
              }

              sendSSE(controller, encoder, data);
            }
          }
        } catch (err) {
          console.error("Stream read error:", err);
          sendSSE(controller, encoder, JSON.stringify({ content: "\n\n[Stream error]" }));
        }

        // Store assistant response
        if (fullText) {
          tryStoreMessage(sessionId, {
            id: `msg_${Date.now()}_assistant`,
            role: "assistant",
            content: fullText.trim(),
            timestamp: Date.now(),
            sessionId,
          });
        }

        sendSSE(controller, encoder, "[DONE]");
        controller.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    console.error("Chat stream error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
