import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────

interface EmailInput {
  id: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  body?: string;
}

// ── AI Actions ────────────────────────────────────────────────────

async function triageEmail(email: EmailInput) {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Categorize this email into one of three categories:
- "topOfMind": Requires action, urgent, important business matters, client requests, deadlines, errors/alerts
- "fyi": Informational, notifications, updates that don't require action
- "newsletters": Newsletters, digests, marketing, promotional content, low-priority updates

Email:
From: ${email.from}
To: ${email.to}
Subject: ${email.subject}
Body: ${email.snippet || email.body || ""}

Respond with ONLY the category key: topOfMind, fyi, or newsletters`,
      },
    ],
  });

  const raw = (msg.content[0] as any).text?.trim().toLowerCase();
  const valid = ["topofmind", "fyi", "newsletters"];
  const map: Record<string, string> = { topofmind: "topOfMind", fyi: "fyi", newsletters: "newsletters" };
  const key = valid.find((v) => raw.includes(v)) || "fyi";
  return map[key];
}

async function summarizeEmail(email: EmailInput): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    messages: [
      {
        role: "user",
        content: `Write a single-line summary (max 15 words) of this email. Be specific and actionable.

From: ${email.from}
Subject: ${email.subject}
Body: ${email.snippet || email.body || ""}

Respond with ONLY the summary, no quotes or punctuation at end.`,
      },
    ],
  });

  return ((msg.content[0] as any).text || "").trim();
}

async function draftReply(email: EmailInput, instruction?: string): Promise<string> {
  const prompt = instruction
    ? `Draft a reply to this email. Instruction: "${instruction}"`
    : `Draft a professional reply to this email. Be concise and helpful.`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `${prompt}

Original email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body || email.snippet || ""}

Write the reply body only (no subject line, no "Dear X," header). Sign off as Erik.`,
      },
    ],
  });

  return ((msg.content[0] as any).text || "").trim();
}

async function analyzeSentiment(email: EmailInput): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: `Analyze the sentiment/urgency of this email. Reply with ONE word only: urgent, angry, positive, or neutral.

From: ${email.from}
Subject: ${email.subject}
Body: ${email.snippet || email.body || ""}`,
      },
    ],
  });

  const raw = ((msg.content[0] as any).text || "").trim().toLowerCase();
  const valid = ["urgent", "angry", "positive", "neutral"];
  return valid.find((v) => raw.includes(v)) || "neutral";
}

async function extractTask(email: EmailInput): Promise<Record<string, string>> {
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Extract a task from this email. Return a JSON object with these fields:
- title: concise action-oriented task title (e.g. "Review contract for Peterson & Co")
- notes: brief context (1-2 sentences)
- priority: high, medium, or low
- due_date: ISO date string if mentioned, otherwise null
- assignee: who should do this (Erik or Anton), default to Erik

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body || email.snippet || ""}

Return ONLY valid JSON, no markdown.`,
      },
    ],
  });

  try {
    const text = ((msg.content[0] as any).text || "").trim();
    // Extract JSON from response (strip any markdown if present)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return {
      title: `Follow up: ${email.subject}`,
      notes: `From: ${email.from}`,
      priority: "medium",
      due_date: "",
      assignee: "Erik",
    };
  }
}

async function bulkTriage(emails: EmailInput[]) {
  // Process in batches of 5 for speed
  const results: Array<{ id: string; category: string; summary: string; sentiment: string }> = [];

  const BATCH = 5;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `For each email below, provide: category (topOfMind|fyi|newsletters), a 10-word max summary, and sentiment (urgent|angry|positive|neutral).

${batch
  .map(
    (e, idx) => `Email ${idx + 1} [id: ${e.id}]:
From: ${e.from}
Subject: ${e.subject}
Snippet: ${e.snippet.substring(0, 150)}`
  )
  .join("\n\n")}

Return ONLY a JSON array like:
[{"id":"...","category":"...","summary":"...","sentiment":"..."}]`,
        },
      ],
    });

    try {
      const text = ((msg.content[0] as any).text || "").trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        results.push(...parsed);
      }
    } catch {
      // If batch fails, add defaults
      batch.forEach((e) =>
        results.push({ id: e.id, category: "fyi", summary: e.subject, sentiment: "neutral" })
      );
    }
  }

  return results;
}

// ── Route Handler ─────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
    }

    const body = await request.json();
    const { action, email, emails, instruction } = body;

    switch (action) {
      case "triage": {
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        const category = await triageEmail(email);
        return Response.json({ category });
      }

      case "summary": {
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        const summary = await summarizeEmail(email);
        return Response.json({ summary });
      }

      case "draft": {
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        const draft = await draftReply(email, instruction);
        return Response.json({ draft });
      }

      case "sentiment": {
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        const sentiment = await analyzeSentiment(email);
        return Response.json({ sentiment });
      }

      case "task": {
        if (!email) return Response.json({ error: "email required" }, { status: 400 });
        const task = await extractTask(email);
        return Response.json({ task });
      }

      case "bulk-triage": {
        if (!emails || !Array.isArray(emails)) {
          return Response.json({ error: "emails array required" }, { status: 400 });
        }
        const results = await bulkTriage(emails);
        return Response.json({ results });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Email AI error:", error);
    return Response.json(
      { error: error.message || "AI operation failed" },
      { status: 500 }
    );
  }
}
