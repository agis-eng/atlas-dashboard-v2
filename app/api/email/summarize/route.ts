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
          content: `Analyze this email and return a JSON object with exactly these fields:
- "summary": 1-2 sentence summary
- "keyPoints": array of key points as strings
- "actionItems": array of action items as strings (empty array if none)
- "sentiment": one of "positive", "neutral", or "negative"

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
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        actionItems: parsed.actionItems,
        sentiment: parsed.sentiment,
      });
    } catch {
      return Response.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Email summarize error:", error);
    return Response.json(
      { error: "Failed to summarize email" },
      { status: 500 }
    );
  }
}
