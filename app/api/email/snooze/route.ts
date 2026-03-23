import { getRedis, REDIS_KEYS } from "@/lib/redis";

const USER_ID = "default";

interface SnoozedEmail {
  emailId: string;
  subject: string;
  from: string;
  snippet: string;
  account: string;
  snoozedAt: string;
  snoozedUntil: string;
}

async function loadSnoozes(): Promise<SnoozedEmail[]> {
  const redis = getRedis();
  const data = await redis.get<SnoozedEmail[]>(REDIS_KEYS.emailSnooze(USER_ID));
  return data || [];
}

async function saveSnoozes(snoozes: SnoozedEmail[]): Promise<void> {
  const redis = getRedis();
  await redis.set(REDIS_KEYS.emailSnooze(USER_ID), snoozes);
}

// GET — list snoozed emails (optionally including already-due ones)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDue = searchParams.get("includeDue") === "true";

    const snoozes = await loadSnoozes();
    const now = new Date().toISOString();

    const result = includeDue
      ? snoozes
      : snoozes.filter((s) => s.snoozedUntil > now);

    // Sort by snoozedUntil ascending
    result.sort((a, b) => a.snoozedUntil.localeCompare(b.snoozedUntil));

    return Response.json({ snoozes: result });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST — snooze an email
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { emailId, subject, from, snippet, account, snoozedUntil } = body;

    if (!emailId || !snoozedUntil) {
      return Response.json(
        { error: "emailId and snoozedUntil are required" },
        { status: 400 }
      );
    }

    const snoozes = await loadSnoozes();

    // Remove any existing snooze for this email
    const filtered = snoozes.filter((s) => s.emailId !== emailId);

    filtered.push({
      emailId,
      subject: subject || "(no subject)",
      from: from || "",
      snippet: snippet || "",
      account: account || "",
      snoozedAt: new Date().toISOString(),
      snoozedUntil,
    });

    await saveSnoozes(filtered);
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a snooze
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const emailId = searchParams.get("emailId");

    if (!emailId) {
      return Response.json({ error: "emailId is required" }, { status: 400 });
    }

    const snoozes = await loadSnoozes();
    const filtered = snoozes.filter((s) => s.emailId !== emailId);
    await saveSnoozes(filtered);

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
