import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

interface FollowUp {
  emailId: string;
  subject: string;
  to: string;
  sentAt: string;
  followUpAfterDays: number;
  followUpDate: string;
  dismissed: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const key = `email:followups:${user.profile}`;
    const followUps = ((await redis.get(key)) as FollowUp[] | null) || [];

    const now = new Date().toISOString();

    // Separate into due and upcoming
    const due = followUps.filter(
      (f) => !f.dismissed && f.followUpDate <= now
    );
    const upcoming = followUps.filter(
      (f) => !f.dismissed && f.followUpDate > now
    );

    return Response.json({ due, upcoming, total: followUps.length });
  } catch (error) {
    console.error("Follow-ups error:", error);
    return Response.json(
      { error: "Failed to get follow-ups" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { emailId, subject, to, followUpAfterDays = 3 } = await request.json();

    if (!emailId || !subject || !to) {
      return Response.json(
        { error: "emailId, subject, and to are required" },
        { status: 400 }
      );
    }

    const redis = getRedis();
    const key = `email:followups:${user.profile}`;
    const followUps = ((await redis.get(key)) as FollowUp[] | null) || [];

    // Remove existing follow-up for this email
    const filtered = followUps.filter((f) => f.emailId !== emailId);

    const sentAt = new Date().toISOString();
    const followUpDate = new Date(
      Date.now() + followUpAfterDays * 24 * 60 * 60 * 1000
    ).toISOString();

    filtered.push({
      emailId,
      subject,
      to,
      sentAt,
      followUpAfterDays,
      followUpDate,
      dismissed: false,
    });

    await redis.set(key, filtered);

    return Response.json({
      success: true,
      followUpDate,
      followUpAfterDays,
    });
  } catch (error) {
    console.error("Create follow-up error:", error);
    return Response.json(
      { error: "Failed to create follow-up" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { emailId, action } = await request.json();

    if (!emailId) {
      return Response.json({ error: "emailId is required" }, { status: 400 });
    }

    const redis = getRedis();
    const key = `email:followups:${user.profile}`;
    const followUps = ((await redis.get(key)) as FollowUp[] | null) || [];

    if (action === "dismiss") {
      const updated = followUps.map((f) =>
        f.emailId === emailId ? { ...f, dismissed: true } : f
      );
      await redis.set(key, updated);
      return Response.json({ success: true, action: "dismissed" });
    }

    if (action === "snooze") {
      const updated = followUps.map((f) =>
        f.emailId === emailId
          ? {
              ...f,
              followUpDate: new Date(
                Date.now() + 2 * 24 * 60 * 60 * 1000
              ).toISOString(),
            }
          : f
      );
      await redis.set(key, updated);
      return Response.json({ success: true, action: "snoozed" });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Update follow-up error:", error);
    return Response.json(
      { error: "Failed to update follow-up" },
      { status: 500 }
    );
  }
}
