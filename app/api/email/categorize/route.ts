import { NextRequest, NextResponse } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

function normalizeSender(sender: string) {
  const match = sender.match(/<([^>]+)>/);
  return (match?.[1] || sender).trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    // Get logged-in user
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sender, category } = await request.json();
    const normalizedSender = normalizeSender(sender || "");
    
    if (!normalizedSender || !category) {
      return NextResponse.json(
        { error: "sender and category are required" },
        { status: 400 }
      );
    }

    const redis = getRedis();
    
    // Get current email settings (filtered by user profile)
    const settings = await redis.get(REDIS_KEYS.emailSettings(user.profile));
    const emailSettings: any = settings && typeof settings === "object" ? settings : {};
    
    // Initialize categorization rules if not exists
    if (!emailSettings.categorization) {
      emailSettings.categorization = {
        topOfMind: [],
        fyi: [],
        newsletter: [],
        spam: []
      };
    }
    
    // Remove sender from all categories first (to prevent duplicates)
    Object.keys(emailSettings.categorization).forEach(cat => {
      emailSettings.categorization[cat] = emailSettings.categorization[cat].filter(
        (s: string) => normalizeSender(s) !== normalizedSender
      );
    });
    
    // Add to new category
    if (!emailSettings.categorization[category]) {
      emailSettings.categorization[category] = [];
    }
    emailSettings.categorization[category].push(normalizedSender);
    
    // Save updated settings
    await redis.set(REDIS_KEYS.emailSettings(user.profile), emailSettings);
    
    // Clear email cache to force refresh
    await redis.del(`email:inbox:${user.profile}:all`);
    
    return NextResponse.json({ 
      success: true, 
      sender: normalizedSender,
      category,
      rules: emailSettings.categorization
    });
  } catch (error) {
    console.error("Categorize error:", error);
    return NextResponse.json(
      { error: "Failed to save categorization rule" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get logged-in user
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const settings = await redis.get(REDIS_KEYS.emailSettings(user.profile));
    const emailSettings: any = settings && typeof settings === "object" ? settings : {};
    
    return NextResponse.json({
      categorization: emailSettings.categorization || {
        topOfMind: [],
        fyi: [],
        newsletter: [],
        spam: []
      }
    });
  } catch (error) {
    console.error("Get categorization error:", error);
    return NextResponse.json(
      { error: "Failed to get categorization rules" },
      { status: 500 }
    );
  }
}
