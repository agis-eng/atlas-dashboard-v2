import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

    const { subject, from, body } = await request.json();

    if (!body) {
      return Response.json(
        { error: "Email body is required" },
        { status: 400 }
      );
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract all actionable tasks and to-dos from this email. Return a JSON object with a single field "tasks" containing an array of task strings. Each task should be a clear, concise action item. If there are no actionable tasks, return an empty array.

Return ONLY valid JSON, no other text.

Subject: ${subject || "(no subject)"}
From: ${from || "unknown"}
Body:
${body}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    try {
      const parsed = JSON.parse(text);
      return Response.json({
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      });
    } catch {
      return Response.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Email extract-tasks error:", error);
    return Response.json(
      { error: "Failed to extract tasks from email" },
      { status: 500 }
    );
  }
}
