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
    const existing = (await redis.get(REDIS_KEYS.fathomRecordings)) as FathomRecording[] | null;
    const existingIds = new Set((existing || []).map((r) => r.id));

    // Fetch all meetings from Fathom API
    const meetings = await fetchAllMeetings();

    let imported = 0;
    const recordings: FathomRecording[] = [...(existing || [])];

    for (const meeting of meetings) {
      if (existingIds.has(meeting.id)) continue;

      const { recording, fullTranscript } = normalizeMeeting(meeting, "api-sync");

      // Run auto-matching
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

      recordings.push(fullRecording);

      // Store full transcript separately if it's long
      if (fullTranscript && fullTranscript.length > 500) {
        await redis.set(REDIS_KEYS.fathomTranscript(meeting.id), fullTranscript);
      }

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
