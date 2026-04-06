import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";
import { fetchAllMeetings, normalizeMeeting } from "@/lib/fathom";
import { suggestProjectForRecording } from "@/lib/matching";
import type { FathomRecording, FathomSyncMeta } from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.FATHOM_API_KEY) {
      return Response.json(
        { error: "FATHOM_API_KEY not configured. Add it to your environment variables." },
        { status: 400 }
      );
    }

    const redis = getRedis();

    // Allow full reset via query param
    const { searchParams } = new URL(request.url);
    const clearFirst = searchParams.get("clear") === "true";
    if (clearFirst) {
      await redis.del(REDIS_KEYS.fathomRecordings);
      console.log("[fathom-sync] Cleared all existing recordings for fresh import");
    }

    const existing = clearFirst ? null : (await redis.get(REDIS_KEYS.fathomRecordings)) as FathomRecording[] | null;
    const existingIds = new Set((existing || []).map((r) => r.id));

    // Fetch all meetings from Fathom API
    const meetings = await fetchAllMeetings();

    let imported = 0;
    const recordings: FathomRecording[] = [];

    // Build lookup of Fathom meetings by multiple ID formats for matching
    // The API returns recording_id (number) but webhooks use their own id format
    const meetingById = new Map<string, typeof meetings[0]>();
    for (const m of meetings) {
      const apiId = m.id || String(m.recording_id || "");
      if (apiId) meetingById.set(apiId, m);
      if (m.recording_id) meetingById.set(String(m.recording_id), m);
      // Also index by URL-based call ID (e.g. "625933419" from fathom.video/calls/625933419)
      if (m.url) {
        const urlId = m.url.split("/").pop();
        if (urlId) meetingById.set(urlId, m);
      }
    }

    // Log what the API actually returned for the first few meetings
    const sampleMeetings = meetings.slice(0, 3);
    for (const m of sampleMeetings) {
      console.log(`[fathom-sync] Meeting "${m.title || m.meeting_title}" (id=${m.id}, recording_id=${m.recording_id}): has_summary=${!!m.default_summary?.markdown_formatted}`);
    }
    console.log(`[fathom-sync] Total meetings from API: ${meetings.length}, existing in Redis: ${existing?.length ?? 0}, lookup keys: ${meetingById.size}`);

    // Clean up existing recordings: strip old transcripts, backfill summaries, re-match unmatched
    let summariesBackfilled = 0;
    let alreadyHadSummary = 0;
    let noMatchInApi = 0;
    let matched = 0;
    const unmatchedToProcess: FathomRecording[] = [];

    for (const rec of existing || []) {
      // Strip legacy transcript field from old records
      delete (rec as any).transcript;

      // Backfill summaries and action items from the bulk-fetched meetings
      const fathomMeeting = meetingById.get(rec.id);
      if (fathomMeeting) {
        const summary = fathomMeeting.default_summary?.markdown_formatted
          || fathomMeeting.default_summary?.plain_text
          || null;
        if (summary && (!rec.summary || rec.summary.length < 10)) {
          rec.summary = summary;
          summariesBackfilled++;
        } else if (rec.summary && rec.summary.length >= 10) {
          alreadyHadSummary++;
        }
        if ((!rec.actionItems || rec.actionItems.length === 0) && fathomMeeting.action_items) {
          rec.actionItems = fathomMeeting.action_items
            .map((a) => a.description || a.text || "")
            .filter(Boolean);
        }
      } else {
        noMatchInApi++;
      }

      // Collect unmatched recordings (no manual assignment and no suggestion)
      if (!rec.projectId && !rec.suggestedProjectId) {
        unmatchedToProcess.push(rec);
      }

      recordings.push(rec);
    }

    // Re-match unmatched recordings (batch of up to 30 per sync to avoid timeout)
    const matchBatch = unmatchedToProcess.slice(0, 30);
    for (const rec of matchBatch) {
      try {
        const match = await suggestProjectForRecording(
          rec.attendeeEmails,
          rec.participants
        );
        if (match) {
          rec.suggestedProjectId = match.projectId;
          rec.suggestedProjectName = match.projectName;
          rec.matchConfidence = match.confidence;
          matched++;
        }
      } catch {
        // Skip matching errors
      }
    }

    console.log(`[fathom-sync] Backfill: ${summariesBackfilled} summaries, ${alreadyHadSummary} already had. Matched ${matched}/${matchBatch.length} (${unmatchedToProcess.length} total unmatched)`);

    // Import new meetings (summaries now included from list API)
    const newMeetings = meetings.filter((m) => {
      const mid = m.id || String(m.recording_id || "");
      return mid && !existingIds.has(mid);
    });

    // Only run matching for small batches (avoid Vercel timeout on bulk imports)
    const shouldMatch = newMeetings.length <= 20;

    for (const meeting of newMeetings) {
      const { recording } = normalizeMeeting(meeting, "api-sync");

      let match = null;
      if (shouldMatch) {
        match = await suggestProjectForRecording(
          recording.attendeeEmails,
          recording.participants
        );
      }

      const fullRecording: FathomRecording = {
        ...recording,
        suggestedProjectId: match?.projectId || null,
        suggestedProjectName: match?.projectName || null,
        matchConfidence: match?.confidence || null,
      };

      recordings.push(fullRecording);
      imported++;
    }

    // Sort by date descending
    recordings.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    await redis.set(REDIS_KEYS.fathomRecordings, recordings);

    // Update sync metadata
    const meta: FathomSyncMeta = {
      lastSyncAt: new Date().toISOString(),
      totalImported: imported,
      apiKeyConfigured: true,
    };
    await redis.set(REDIS_KEYS.fathomSyncMeta, meta);

    return Response.json({
      success: true,
      imported,
      summariesBackfilled,
      matched,
      unmatchedRemaining: unmatchedToProcess.length - matched,
      total: recordings.length,
      alreadyExisted: meetings.length - imported,
    });
  } catch (error: any) {
    console.error("Fathom sync error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const redis = getRedis();
    const meta = (await redis.get(REDIS_KEYS.fathomSyncMeta)) as FathomSyncMeta | null;
    const recordings = (await redis.get(REDIS_KEYS.fathomRecordings)) as FathomRecording[] | null;

    return Response.json({
      apiKeyConfigured: !!process.env.FATHOM_API_KEY,
      lastSyncAt: meta?.lastSyncAt || null,
      totalRecordings: recordings?.length || 0,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
