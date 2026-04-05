import { NextRequest } from "next/server";
import crypto from "crypto";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import { normalizeWebhookPayload } from "@/lib/fathom";
import { suggestProjectForRecording } from "@/lib/matching";
import type { FathomRecording } from "@/lib/redis";

const NOTION_TOKEN = process.env.NOTION_TOKEN || "";
const CLIENTS_DB_ID = process.env.NOTION_CLIENTS_DB_ID || "31e59b38371a805ba925e0aed72302ea";
const PARTNERS_DB_ID = process.env.NOTION_PARTNERS_DB_ID || "31e59b38371a8089ae0fc758b8d8fc10";
const FATHOM_SECRET = process.env.FATHOM_WEBHOOK_SECRET || "";

const notionHeaders = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  "Content-Type": "application/json",
  "Notion-Version": "2022-06-28",
};

// ── Svix signature verification ─────────────────────────────────────────────
function verifySvixSignature(rawBody: Buffer, headers: Headers, secret: string): boolean {
  const msgId = headers.get("webhook-id");
  const msgTimestamp = headers.get("webhook-timestamp");
  const msgSignature = headers.get("webhook-signature");

  if (!msgId || !msgTimestamp || !msgSignature) return false;

  const ts = parseInt(msgTimestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const toSign = `${msgId}.${msgTimestamp}.${rawBody.toString("utf8")}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const computed = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

  return msgSignature.split(" ").some((sig) => {
    if (!sig.startsWith("v1,")) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig.slice(3)), Buffer.from(computed));
    } catch {
      return false;
    }
  });
}

// ── Match attendees to Notion client/partner pages ───────────────────────────
async function findNotionPages(emails: string[], names: string[]) {
  if (!NOTION_TOKEN) return [];

  const matches: Array<{ pageId: string; dbId: string; type: string; name: string }> = [];
  const seen = new Set<string>();

  for (const dbId of [CLIENTS_DB_ID, PARTNERS_DB_ID]) {
    const dbType = dbId === CLIENTS_DB_ID ? "client" : "partner";

    // Match by email first (most reliable)
    for (const email of emails) {
      try {
        const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
          method: "POST",
          headers: notionHeaders,
          body: JSON.stringify({ filter: { property: "Email", email: { equals: email } } }),
        });
        const data = await r.json();
        for (const page of data.results || []) {
          if (!seen.has(page.id)) {
            seen.add(page.id);
            matches.push({
              pageId: page.id,
              dbId,
              type: dbType,
              name: page.properties.Name?.title?.[0]?.plain_text || email,
            });
          }
        }
      } catch (err) {
        console.error(`Notion email query failed for ${email}:`, err);
      }
    }

    // Fallback: match by first name if no email match found
    if (matches.length === 0) {
      for (const name of names) {
        try {
          const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              filter: { property: "Name", title: { contains: name.split(" ")[0] } },
            }),
          });
          const data = await r.json();
          for (const page of data.results || []) {
            if (!seen.has(page.id)) {
              seen.add(page.id);
              matches.push({
                pageId: page.id,
                dbId,
                type: dbType,
                name: page.properties.Name?.title?.[0]?.plain_text || name,
              });
            }
          }
        } catch (err) {
          console.error(`Notion name query failed for ${name}:`, err);
        }
      }
    }
  }

  return matches;
}

// ── Update Last Call date + increment Call Count on Notion page ───────────────
async function updateCallStats(pageId: string, date: string) {
  if (!NOTION_TOKEN) return;
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders });
    const page = await r.json();
    const currentCount = page.properties?.["Call Count"]?.number || 0;

    await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: notionHeaders,
      body: JSON.stringify({
        properties: {
          "Last Call": { date: { start: date } },
          "Call Count": { number: currentCount + 1 },
        },
      }),
    });
  } catch (err) {
    console.error(`Failed to update call stats for ${pageId}:`, err);
  }
}

// ── Build Notion toggle block with call content ───────────────────────────────
function buildCallToggleBlock({
  summary,
  actionItems,
  attendees,
  meetingDate,
  meetingTitle,
  recordingUrl,
}: {
  summary: string;
  actionItems: string[];
  attendees: Array<{ name?: string; email?: string }>;
  meetingDate: string;
  meetingTitle: string;
  recordingUrl: string;
}) {
  const attendeeList = attendees
    .map((a) => a.name || a.email || "")
    .filter(Boolean)
    .join(", ");

  const children: any[] = [];

  if (attendeeList) {
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: `👥 Attendees: ${attendeeList}` },
            annotations: { bold: true },
          },
        ],
      },
    });
  }

  if (recordingUrl) {
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { type: "text", text: { content: "🎥 Recording: " }, annotations: { bold: true } },
          { type: "text", text: { content: recordingUrl, link: { url: recordingUrl } } },
        ],
      },
    });
  }

  if (summary) {
    children.push(
      {
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: "Summary" } }] },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: summary } }] },
      }
    );
  }

  if (actionItems.length > 0) {
    children.push({
      object: "block",
      type: "heading_3",
      heading_3: { rich_text: [{ type: "text", text: { content: "Action Items" } }] },
    });
    for (const item of actionItems) {
      children.push({
        object: "block",
        type: "to_do",
        to_do: { rich_text: [{ type: "text", text: { content: item } }], checked: false },
      });
    }
  }

  return {
    object: "block",
    type: "toggle",
    toggle: {
      rich_text: [
        { type: "text", text: { content: `📞 Call — ${meetingDate} — ${meetingTitle}` } },
      ],
      children,
    },
  };
}

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const rawBody = Buffer.from(await request.arrayBuffer());

    // Verify Svix signature if secret is configured
    if (FATHOM_SECRET) {
      const valid = verifySvixSignature(rawBody, request.headers, FATHOM_SECRET);
      if (!valid) {
        console.error("Fathom webhook: invalid Svix signature");
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch (parseErr) {
      console.error("Fathom webhook: invalid JSON", rawBody.toString("utf8").substring(0, 500));
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Save raw payload to Redis for debugging
    const redis2 = getRedis();
    await redis2.set("fathom:debug:last_payload", {
      receivedAt: new Date().toISOString(),
      body,
    }, { ex: 86400 });

    console.log("Fathom webhook keys:", Object.keys(body || {}).join(","));

    // ── Normalize using shared utility ────────────────────────────────────────
    let normalized;
    try {
      normalized = normalizeWebhookPayload(body);
    } catch (err: any) {
      console.error("Fathom webhook: normalization failed:", err.message);
      return Response.json({ error: err.message }, { status: 400 });
    }

    const { recording } = normalized;

    // Run auto-matching for project suggestion
    const match = await suggestProjectForRecording(
      recording.attendeeEmails,
      recording.participants
    );

    const fullRecording: FathomRecording = {
      ...recording,
      suggestedProjectId: match?.projectId || null,
      suggestedProjectName: match?.projectName || null,
      matchConfidence: match?.confidence || null,
    };

    // ── Store in Redis ────────────────────────────────────────────────────────
    const redis = getRedis();
    const key = REDIS_KEYS.fathomRecordings;
    const existing = (await redis.get(key)) as any[] | null;
    const recordings = Array.isArray(existing) ? existing : [];
    const alreadyExists = recordings.some((r: any) => r.id === fullRecording.id);
    if (!alreadyExists) {
      recordings.unshift(fullRecording);
      if (recordings.length > 500) recordings.splice(500);
      await redis.set(key, recordings);
    }

    // ── Notion integration ────────────────────────────────────────────────────
    // Extract raw data for Notion (needs original attendees format)
    const payload = body?.payload || body;
    const d = payload?.data || payload;
    const attendees: Array<{ name?: string; email?: string }> = d.attendees || d.participants || d.calendar_invitees || [];
    const meetingTitle = fullRecording.title;
    const meetingDate = (fullRecording.date || new Date().toISOString()).split("T")[0];
    const summary = fullRecording.summary || "";
    const actionItems = fullRecording.actionItems;
    const recordingUrl = fullRecording.url || "";

    const notionResults = { saved: [] as string[], failed: [] as string[], matched: 0 };

    if (NOTION_TOKEN) {
      const attendeeEmails = attendees
        .map((a) => (a.email || "").toLowerCase())
        .filter((e) => e && !e.includes("manifestbot.ai") && !e.includes("manifestic.com"));

      const attendeeNames = attendees.map((a) => a.name || "").filter(Boolean);

      const matches = await findNotionPages(attendeeEmails, attendeeNames);
      notionResults.matched = matches.length;

      const toggleBlock = buildCallToggleBlock({
        summary,
        actionItems,
        attendees,
        meetingDate,
        meetingTitle,
        recordingUrl,
      });

      for (const match of matches) {
        try {
          const r = await fetch(`https://api.notion.com/v1/blocks/${match.pageId}/children`, {
            method: "PATCH",
            headers: notionHeaders,
            body: JSON.stringify({ children: [toggleBlock] }),
          });
          if (!r.ok) {
            const err = await r.text();
            throw new Error(`Notion ${r.status}: ${err}`);
          }
          await updateCallStats(match.pageId, meetingDate);
          notionResults.saved.push(match.name);
        } catch (err: any) {
          console.error(`Failed to save to Notion for ${match.name}:`, err.message);
          notionResults.failed.push(match.name);
        }
      }

      console.log(
        `Fathom webhook: ${meetingTitle} | Redis: ${alreadyExists ? "duplicate" : "saved"} | Notion: ${notionResults.saved.length} saved, ${notionResults.failed.length} failed`
      );
    }

    return Response.json({
      success: true,
      id: fullRecording.id,
      redisStored: !alreadyExists,
      notion: notionResults,
    });
  } catch (error: any) {
    console.error("Fathom webhook error:", error);
    return Response.json({ error: error.message || "Webhook processing failed" }, { status: 500 });
  }
}

// GET — health check / webhook URL verification
export async function GET() {
  return Response.json({ status: "Fathom webhook endpoint active" });
}
