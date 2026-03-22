import { getRedis, REDIS_KEYS, type ChatMessage } from "@/lib/redis";

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

    // Call OpenClaw API (or fallback to echo for now)
    const openclawUrl = process.env.OPENCLAW_API_URL;
    const openclawKey = process.env.OPENCLAW_API_KEY;

    if (openclawUrl && openclawKey) {
      // Stream from OpenClaw
      const response = await fetch(`${openclawUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openclawKey}`,
        },
        body: JSON.stringify({ message, profile }),
      });

      if (!response.ok || !response.body) {
        throw new Error("OpenClaw API error");
      }

      // Collect full response for storage, stream to client
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

            // Store assistant response
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}_assistant`,
              role: "assistant",
              content: fullResponse,
              timestamp: Date.now(),
              sessionId,
            };
            await redis.rpush(REDIS_KEYS.chatMessages(sessionId), JSON.stringify(assistantMsg));

            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (err) {
            controller.error(err);
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
    }

    // Fallback: echo mode with simulated streaming
    const fallbackResponse = `I received your message: "${message}". OpenClaw API is not configured — set OPENCLAW_API_URL and OPENCLAW_API_KEY environment variables to enable AI responses.`;
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

        // Store assistant message
        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_assistant`,
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
          sessionId,
        };
        await redis.rpush(REDIS_KEYS.chatMessages(sessionId), JSON.stringify(assistantMsg));

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
    return Response.json({ error: "Failed to stream response" }, { status: 500 });
  }
}
