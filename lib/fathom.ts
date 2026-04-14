import type { FathomRecording } from "./redis";

const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";
const INTERNAL_DOMAINS = ["manifestbot.ai", "manifestic.com"];

interface FathomMeetingResponse {
  items: FathomMeeting[];
  limit: number;
  next_cursor?: string;
}

interface FathomMeeting {
  id?: string;
  recording_id?: number;
  title?: string;
  meeting_title?: string;
  url?: string;
  share_url?: string;
  created_at?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  recording_start_time?: string;
  recording_end_time?: string;
  calendar_invitees?: Array<{ name?: string; email?: string }>;
  recorded_by?: { name?: string; email?: string; team?: string };
  default_summary?: { markdown_formatted?: string; plain_text?: string };
  action_items?: Array<{ description?: string; text?: string; assignee?: string }>;
}

function getApiKey(): string {
  const key = process.env.FATHOM_API_KEY;
  if (!key) throw new Error("FATHOM_API_KEY not configured");
  return key;
}

export async function listMeetings(options?: {
  cursor?: string;
  includeSummary?: boolean;
  createdAfter?: string;
  createdBefore?: string;
}): Promise<FathomMeetingResponse> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.includeSummary) params.set("include_summary", "true");
  if (options?.createdAfter) params.set("created_after", options.createdAfter);
  if (options?.createdBefore) params.set("created_before", options.createdBefore);

  const url = `${FATHOM_API_BASE}/meetings${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": getApiKey() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fathom API ${res.status}: ${text}`);
  }

  return res.json();
}

export async function getMeeting(meetingId: string): Promise<FathomMeeting> {
  const url = `${FATHOM_API_BASE}/meetings/${meetingId}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": getApiKey() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fathom API ${res.status}: ${text}`);
  }

  return res.json();
}

export async function fetchAllMeetings(options?: {
  createdAfter?: string;
  createdBefore?: string;
}): Promise<FathomMeeting[]> {
  const all: FathomMeeting[] = [];
  let cursor: string | undefined;

  do {
    const res = await listMeetings({
      cursor,
      includeSummary: true,
      createdAfter: options?.createdAfter,
      createdBefore: options?.createdBefore,
    });
    all.push(...res.items);
    cursor = res.next_cursor;
  } while (cursor);

  return all;
}

function computeDuration(meeting: FathomMeeting): number | undefined {
  const start = meeting.recording_start_time || meeting.scheduled_start_time;
  const end = meeting.recording_end_time || meeting.scheduled_end_time;
  if (!start || !end) return undefined;
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return diff > 0 ? Math.round(diff) : undefined;
}

function isInternalEmail(email: string): boolean {
  return INTERNAL_DOMAINS.some((d) => email.toLowerCase().includes(d));
}

export function normalizeMeeting(
  meeting: FathomMeeting,
  source: "webhook" | "api-sync"
): { recording: Omit<FathomRecording, "suggestedProjectId" | "suggestedProjectName" | "matchConfidence"> } {
  const invitees = meeting.calendar_invitees || [];
  const allParticipants = invitees
    .map((a) => a.name || a.email || "Unknown")
    .filter(Boolean);
  const allEmails = invitees
    .map((a) => (a.email || "").toLowerCase())
    .filter((e) => e && !isInternalEmail(e));

  const summary =
    meeting.default_summary?.markdown_formatted ||
    meeting.default_summary?.plain_text ||
    null;

  const meetingId = meeting.id || String(meeting.recording_id || "");

  console.log(`[fathom] normalizeMeeting ${meetingId}: default_summary keys=${JSON.stringify(Object.keys(meeting.default_summary || {}))}, summary=${summary ? summary.slice(0, 80) + "..." : "null"}`);

  const actionItems = (meeting.action_items || [])
    .map((a) => a.description || a.text || "")
    .filter(Boolean);

  // Build a descriptive title from participant names + date
  const rawTitle = meeting.title || meeting.meeting_title || "";
  const isGenericTitle = !rawTitle || /^(impromptu|zoom|google meet|teams)/i.test(rawTitle.trim());
  const meetingDate = meeting.created_at || meeting.recording_start_time || new Date().toISOString();
  const dateStr = new Date(meetingDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let title = rawTitle || "Untitled Call";
  if (isGenericTitle && allParticipants.length > 0) {
    // Use external participant names (exclude internal team), fall back to all
    const externalNames = invitees
      .filter((a) => a.email && !isInternalEmail(a.email))
      .map((a) => a.name || a.email || "")
      .filter(Boolean);
    const displayNames = externalNames.length > 0 ? externalNames : allParticipants;
    const nameStr = displayNames.slice(0, 3).join(", ") + (displayNames.length > 3 ? ` +${displayNames.length - 3}` : "");
    title = `${nameStr} — ${dateStr}`;
  }

  const recording = {
    id: meetingId,
    title,
    date: meetingDate,
    duration: computeDuration(meeting),
    participants: allParticipants,
    attendeeEmails: allEmails,
    summary,
    actionItems,
    url: meeting.share_url || meeting.url || null,
    projectId: null,
    projectName: null,
    status: "processed" as const,
    receivedAt: new Date().toISOString(),
    source,
  };

  return { recording };
}

export function normalizeWebhookPayload(body: any): {
  recording: Omit<FathomRecording, "suggestedProjectId" | "suggestedProjectName" | "matchConfidence">;
} {
  const payload = body?.payload || body;
  const d = payload?.data || payload;

  if (!d?.id) throw new Error("Invalid payload: missing id");

  const attendees: Array<{ name?: string; email?: string }> =
    d.attendees || d.participants || d.calendar_invitees || [];
  const allEmails = attendees
    .map((a: any) => (a.email || "").toLowerCase())
    .filter((e: string) => e && !isInternalEmail(e));

  const summary: string = d.summary || d.ai_notes?.summary ||
    d.default_summary?.markdown_formatted || d.default_summary?.plain_text || "";

  const actionItems: string[] = (d.action_items || d.ai_notes?.action_items || [])
    .map((a: any) => (typeof a === "string" ? a : a.text || a.description || ""))
    .filter(Boolean);

  const recordingUrl: string =
    d.share_url || d.recording_url || d.video_url || d.url || "";

  const meetingDate =
    d.ended_at || d.date || d.created_at || new Date().toISOString();

  const duration = d.duration || undefined;

  const recording = {
    id: d.id,
    title: d.title || d.name || d.meeting_title || "Untitled Call",
    date: meetingDate,
    duration,
    participants: attendees.map((p: any) => p.name || p.email || "Unknown"),
    attendeeEmails: allEmails,
    summary: summary || null,
    actionItems,
    url: recordingUrl || null,
    projectId: null,
    projectName: null,
    status: "processed" as const,
    receivedAt: new Date().toISOString(),
    source: "webhook" as const,
  };

  return { recording };
}
