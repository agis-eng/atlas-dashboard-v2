import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface EmailForCategorization {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { emails } = (await request.json()) as {
      emails: EmailForCategorization[];
    };

    if (!emails || emails.length === 0) {
      return Response.json({ error: "emails array required" }, { status: 400 });
    }

    // Batch categorize up to 20 emails at a time
    const batch = emails.slice(0, 20);

    const emailList = batch
      .map(
        (e, i) =>
          `${i + 1}. From: ${e.from}\n   Subject: ${e.subject}\n   Preview: ${e.snippet?.substring(0, 100) || ""}`
      )
      .join("\n\n");

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Categorize each email into exactly one category. Categories:
- "actionRequired": Needs a direct response or action from the user
- "fyi": Informational, no action needed but relevant
- "newsletter": Marketing, newsletters, subscriptions
- "receipt": Order confirmations, invoices, receipts, shipping updates
- "waitingOn": User is waiting for someone else to respond
- "spam": Junk, scams, unwanted solicitations

Return a JSON object mapping email number to category. Example: {"1":"actionRequired","2":"newsletter","3":"fyi"}

Return ONLY valid JSON.

Emails:
${emailList}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "{}";

    try {
      const categorizations = JSON.parse(text);

      // Map back to email IDs
      const results: Record<string, string> = {};
      batch.forEach((email, i) => {
        const key = String(i + 1);
        if (categorizations[key]) {
          results[email.id] = categorizations[key];
        }
      });

      // Optionally save categorization rules to Redis for learning
      const redis = getRedis();
      const settingsKey = REDIS_KEYS.emailSettings(user.profile);
      const settings = (await redis.get(settingsKey)) as any || {};

      if (!settings.aiCategorizations) {
        settings.aiCategorizations = {};
      }

      // Store sender -> category mappings for future auto-categorization
      batch.forEach((email) => {
        const category = results[email.id];
        if (category) {
          const senderDomain = email.from.match(/@([^\s>]+)/)?.[1] || email.from;
          settings.aiCategorizations[senderDomain] = category;
        }
      });

      await redis.set(settingsKey, settings);

      return Response.json({ categorizations: results });
    } catch {
      return Response.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Auto-categorize error:", error);
    return Response.json(
      { error: "Failed to auto-categorize emails" },
      { status: 500 }
    );
  }
}
