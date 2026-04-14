import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, emails, history = [] } = await request.json();

    if (!message) {
      return Response.json({ error: "Message required" }, { status: 400 });
    }

    const emailList = (emails || [])
      .map(
        (e: any, i: number) =>
          `${i + 1}. [ID:${e.id}] [${e.read ? "Read" : "UNREAD"}] From: ${e.from} | Subject: ${e.subject} | Date: ${e.date}`
      )
      .join("\n");

    const chatHistory = history.map((h: any) => ({
      role: h.role as "user" | "assistant",
      content: h.text,
    }));

    const messages = [
      ...chatHistory,
      {
        role: "user" as const,
        content: message,
      },
    ];

    const aiResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: `You are an AI email assistant for ${user.name || "the user"}. You can help them understand, organize, and manage their inbox.

When the user asks you to take actions (archive, delete, mark as read, etc.), include an "actions" array in your response. Each action should have:
- "type": "archive", "delete", or "mark-read"
- "emailIds": array of email ID strings

Only include actions when the user explicitly asks you to do something. For questions/analysis, just respond with text.

Current inbox (${(emails || []).length} emails):
${emailList}

Respond conversationally but concisely. When suggesting actions, be specific about which emails.

IMPORTANT: Your response must be valid JSON with this format:
{"response": "your text response here", "actions": []}

The "actions" array should be empty [] unless the user asks you to perform an action.`,
      messages,
    });

    const aiText =
      aiResponse.content[0].type === "text"
        ? aiResponse.content[0].text
        : "";

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(aiText);

      // Execute actions if any
      if (parsed.actions && parsed.actions.length > 0) {
        const redis = getRedis();
        for (const action of parsed.actions) {
          if (action.type === "archive" || action.type === "delete" || action.type === "mark-read") {
            // We'll let the client handle the actual IMAP actions
            // Just pass them through
          }
        }
      }

      return Response.json({
        response: parsed.response || aiText,
        actions: parsed.actions || [],
      });
    } catch {
      // If not valid JSON, just return the text
      return Response.json({
        response: aiText,
        actions: [],
      });
    }
  } catch (error) {
    console.error("AI chat error:", error);
    return Response.json(
      { error: "Failed to process chat" },
      { status: 500 }
    );
  }
}
