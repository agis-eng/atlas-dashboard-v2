import { getRedis, REDIS_KEYS, type ChatMessage } from "@/lib/redis";

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

export async function POST(request: Request) {
  try {
    const { message, sessionId, profile = "erik" } = await request.json();

    if (!message || !sessionId) {
      return Response.json({ error: "Missing message or sessionId" }, { status: 400 });
    }

    // Store user message (non-blocking, won't crash if Redis is down)
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: message,
      timestamp: Date.now(),
      sessionId,
    };
    tryStoreMessage(sessionId, userMsg);
    tryUpdateSession(sessionId, profile, message.slice(0, 50));

    // OpenClaw chat integration:
    // OpenClaw runs on localhost (Mac mini). For chat to work from Vercel:
    //   a) Expose OpenClaw gateway API publicly (e.g. via Cloudflare Tunnel or ngrok)
    //   b) Set up a webhook-based integration (OpenClaw calls back to Atlas)
    //   c) Keep disabled for now — falls back to echo mode gracefully
    // Set OPENCLAW_API_URL and OPENCLAW_API_KEY env vars when ready.
    const openclawUrl = process.env.OPENCLAW_API_URL;
    const openclawKey = process.env.OPENCLAW_API_KEY;

    if (openclawUrl && openclawKey) {
      try {
        const response = await fetch(`${openclawUrl}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openclawKey}`,
          },
          body: JSON.stringify({ message, profile }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`OpenClaw API returned ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
              }

              // Store assistant response (non-blocking)
              tryStoreMessage(sessionId, {
                id: `msg_${Date.now()}_assistant`,
                role: "assistant",
                content: fullResponse,
                timestamp: Date.now(),
                sessionId,
              });

              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
            } catch (err) {
              // If streaming fails mid-way, send error and close
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "\n\n[Connection to OpenClaw lost]" })}\n\n`));
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } catch (err) {
        console.error("OpenClaw API error:", err);
        // Fall through to fallback
      }
    }

    // Fallback: echo mode with simulated streaming
    const fallbackResponse = openclawUrl
      ? `OpenClaw API is currently unreachable. Your message: "${message}"`
      : `Echo: "${message}"\n\nTo enable AI responses, set OPENCLAW_API_URL and OPENCLAW_API_KEY in your environment.`;
    const words = fallbackResponse.split(" ");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullText = "";

        for (const word of words) {
          const chunk = (fullText ? " " : "") + word;
          fullText += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          await new Promise((r) => setTimeout(r, 30));
        }

        // Store assistant message (non-blocking)
        tryStoreMessage(sessionId, {
          id: `msg_${Date.now()}_assistant`,
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
          sessionId,
        });

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat stream error:", error);
    // Even on total failure, return a streaming response so the client doesn't crash
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "Sorry, something went wrong. Please try again." })}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
}
