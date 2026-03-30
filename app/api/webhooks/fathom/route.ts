import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

// Fathom webhook payload (adjust fields as Fathom's actual schema)
interface FathomWebhookPayload {
  event: string;
  data: {
    id: string;
    title?: string;
    name?: string;
    date?: string;
    created_at?: string;
    duration?: number;
    participants?: Array<{ name?: string; email?: string }>;
    summary?: string;
    action_items?: string[];
    transcript_url?: string;
    recording_url?: string;
    share_url?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Optional: verify Fathom webhook secret
    const secret = process.env.FATHOM_WEBHOOK_SECRET;
    if (secret) {
      const signature = request.headers.get("x-fathom-signature") || request.headers.get("x-webhook-secret");
      if (signature !== secret) {
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload: FathomWebhookPayload = await request.json();

    // We accept any event with recording data
    const d = payload.data;
    if (!d || !d.id) {
      return Response.json({ error: "Invalid payload: missing id" }, { status: 400 });
    }

    const redis = getRedis();

    // Build a normalized recording object
    const recording = {
      id: d.id,
      title: d.title || d.name || "Untitled Call",
      date: d.date || d.created_at || new Date().toISOString(),
      duration: d.duration,
      participants: d.participants?.map((p) => p.name || p.email || "Unknown") || [],
      summary: d.summary || null,
      actionItems: d.action_items || [],
      url: d.share_url || d.recording_url || d.transcript_url || null,
      projectId: null,
      projectName: null,
      status: "processed",
      receivedAt: new Date().toISOString(),
    };

    // Store in Redis as a list
    const key = "fathom:recordings";

    // Get existing recordings
    const existing = await redis.get(key) as any[] | null;
    const recordings = Array.isArray(existing) ? existing : [];

    // Check for duplicate
    const alreadyExists = recordings.some((r: any) => r.id === recording.id);
    if (!alreadyExists) {
      recordings.unshift(recording); // newest first
      // Keep max 200 recordings
      if (recordings.length > 200) recordings.splice(200);
      await redis.set(key, recordings);
    }

    console.log(`Fathom webhook received: ${recording.title} (${recording.id})`);

    return Response.json({ success: true, id: recording.id });
  } catch (error: any) {
    console.error("Fathom webhook error:", error);
    return Response.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// GET is used to verify the webhook URL is live
export async function GET() {
  return Response.json({ status: "Fathom webhook endpoint active" });
}
