import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sender, action } = await request.json();

    if (!sender) {
      return Response.json({ error: "sender is required" }, { status: 400 });
    }

    const redis = getRedis();
    const settingsKey = REDIS_KEYS.emailSettings(user.profile);
    const settings = (await redis.get(settingsKey)) as any || {};

    if (!settings.blockedSenders) {
      settings.blockedSenders = [];
    }

    if (action === "unblock") {
      settings.blockedSenders = settings.blockedSenders.filter(
        (s: string) => s !== sender
      );
    } else {
      // Block: add to blocked list and categorize as spam
      if (!settings.blockedSenders.includes(sender)) {
        settings.blockedSenders.push(sender);
      }

      // Also add to spam categorization
      if (!settings.categorization) {
        settings.categorization = { topOfMind: [], fyi: [], newsletter: [], spam: [] };
      }
      // Remove from all categories first
      Object.keys(settings.categorization).forEach((cat) => {
        settings.categorization[cat] = settings.categorization[cat].filter(
          (s: string) => s !== sender
        );
      });
      settings.categorization.spam.push(sender);
    }

    await redis.set(settingsKey, settings);

    // Clear email cache
    await redis.del(`email:inbox:${user.profile}:all`);

    return Response.json({
      success: true,
      action: action === "unblock" ? "unblocked" : "blocked",
      sender,
      blockedSenders: settings.blockedSenders,
    });
  } catch (error) {
    console.error("Block sender error:", error);
    return Response.json(
      { error: "Failed to block sender" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const settings = (await redis.get(REDIS_KEYS.emailSettings(user.profile))) as any || {};

    return Response.json({
      blockedSenders: settings.blockedSenders || [],
    });
  } catch (error) {
    console.error("Get blocked senders error:", error);
    return Response.json(
      { error: "Failed to get blocked senders" },
      { status: 500 }
    );
  }
}
