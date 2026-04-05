import type { FathomRecording } from "./redis";

const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";
const INTERNAL_DOMAINS = ["manifestbot.ai", "manifestic.com"];

interface FathomMeetingResponse {
  items: FathomMeeting[];
  limit: number;
  next_cursor?: string;
}

interface FathomMeeting {
  id: string;
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
  transcript?: Array<{ speaker?: string; text?: string; start_time?: number }>;
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
  includeTranscript?: boolean;
  includeSummary?: boolean;
  createdAfter?: string;
  createdBefore?: string;
}): Promise<FathomMeetingResponse> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.includeTranscript) params.set("include_transcript", "true");
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

function formatTranscript(
  transcript?: Array<{ speaker?: string; text?: string }>
): string {
  if (!transcript || transcript.length === 0) return "";
  return transcript
    .map((t) => `${t.speaker || "Speaker"}: ${t.text || ""}`)
    .join("\n");
}

function isInternalEmail(email: string): boolean {
  return INTERNAL_DOMAINS.some((d) => email.toLowerCase().includes(d));
}

export function normalizeMeeting(
  meeting: FathomMeeting,
  source: "webhook" | "api-sync"
): { recording: Omit<FathomRecording, "suggestedProjectId" | "suggestedProjectName" | "matchConfidence">; fullTranscript: string } {
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

  const actionItems = (meeting.action_items || [])
    .map((a) => a.description || a.text || "")
    .filter(Boolean);

  const fullTranscript = formatTranscript(meeting.transcript);
  const transcriptPreview = fullTranscript.length > 500
    ? fullTranscript.slice(0, 500) + "..."
    : fullTranscript;

  const recording = {
    id: meeting.id,
    title: meeting.title || meeting.meeting_title || "Untitled Call",
    date: meeting.created_at || meeting.recording_start_time || new Date().toISOString(),
    duration: computeDuration(meeting),
    participants: allParticipants,
    attendeeEmails: allEmails,
    summary,
    actionItems,
    transcript: transcriptPreview || undefined,
    url: meeting.share_url || meeting.url || null,
    projectId: null,
    projectName: null,
    status: "processed" as const,
    receivedAt: new Date().toISOString(),
    source,
  };

  return { recording, fullTranscript };
}

export function normalizeWebhookPayload(body: any): {
  recording: Omit<FathomRecording, "suggestedProjectId" | "suggestedProjectName" | "matchConfidence">;
  fullTranscript: string;
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

  const rawTranscript = d.transcript || d.full_transcript || "";
  const fullTranscript = typeof rawTranscript === "string"
    ? rawTranscript
    : Array.isArray(rawTranscript)
      ? formatTranscript(rawTranscript)
      : "";

  const transcriptPreview = fullTranscript.length > 500
    ? fullTranscript.slice(0, 500) + "..."
    : fullTranscript;

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
    transcript: transcriptPreview || undefined,
    url: recordingUrl || null,
    projectId: null,
    projectName: null,
    status: "processed" as const,
    receivedAt: new Date().toISOString(),
    source: "webhook" as const,
  };

  return { recording, fullTranscript };
}
