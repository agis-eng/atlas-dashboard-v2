import { NextRequest, NextResponse } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    // Get logged-in user
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sender, category } = await request.json();
    
    if (!sender || !category) {
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
        (s: string) => s !== sender
      );
    });
    
    // Add to new category
    if (!emailSettings.categorization[category]) {
      emailSettings.categorization[category] = [];
    }
    emailSettings.categorization[category].push(sender);
    
    // Save updated settings
    await redis.set(REDIS_KEYS.emailSettings(user.profile), emailSettings);
    
    // Clear email cache to force refresh
    await redis.del(`email:inbox:${user.profile}:all`);
    
    return NextResponse.json({ 
      success: true, 
      sender,
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
