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

    const { subject, from, body, tone = "professional" } = await request.json();

    if (!body) {
      return Response.json(
        { error: "Email body is required" },
        { status: 400 }
      );
    }

    const toneInstructions: Record<string, string> = {
      professional:
        "Write in a professional but friendly tone. Be concise and direct.",
      casual:
        "Write in a casual, friendly tone like you'd email a friend or close colleague.",
      formal:
        "Write in a formal business tone appropriate for clients or executives.",
      brief:
        "Keep it extremely brief — 1-3 sentences max. Just acknowledge and respond to the key point.",
    };

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are drafting an email reply on behalf of ${user.name || "the user"}. ${toneInstructions[tone] || toneInstructions.professional}

Write ONLY the reply body text — no subject line, no "Dear X" unless appropriate, no signature. The user will review and edit before sending.

Original email:
From: ${from || "unknown"}
Subject: ${subject || "(no subject)"}
Body:
${body.substring(0, 3000)}

Draft a reply:`,
        },
      ],
    });

    const draft =
      message.content[0].type === "text" ? message.content[0].text : "";

    return Response.json({ draft: draft.trim() });
  } catch (error) {
    console.error("Auto-draft error:", error);
    return Response.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    );
  }
}
