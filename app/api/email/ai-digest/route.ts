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

    const { emails } = await request.json();

    if (!emails || emails.length === 0) {
      return Response.json({ error: "No emails provided" }, { status: 400 });
    }

    const emailList = emails
      .map(
        (e: any, i: number) =>
          `${i + 1}. [${e.read ? "Read" : "UNREAD"}] From: ${e.from} | Subject: ${e.subject} | Date: ${e.date} | Preview: ${e.snippet || ""}`
      )
      .join("\n");

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are an executive assistant reviewing ${user.name || "the user"}'s inbox. Give a concise, actionable digest. Use this format:

**Priority — Needs Attention:**
- List emails that need a reply or action, with sender and topic

**Informational — FYI:**
- Brief notes on emails that are just informational

**Cleanup Suggestions:**
- Newsletters, marketing, or spam that could be archived/deleted

**Quick Stats:**
- X unread, X total, top senders

Keep it concise and actionable. No fluff.

Inbox (${emails.length} emails):
${emailList}`,
        },
      ],
    });

    const digest =
      message.content[0].type === "text" ? message.content[0].text : "";

    return Response.json({ digest });
  } catch (error) {
    console.error("AI digest error:", error);
    return Response.json(
      { error: "Failed to generate digest" },
      { status: 500 }
    );
  }
}
