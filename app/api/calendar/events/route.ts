import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSessionUserFromRequest } from "@/lib/auth";

const EVENTS_CACHE_KEY = (userId: string) => `calendar:events:${userId}`;

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const cacheKey = EVENTS_CACHE_KEY(user.profile);
    
    let cached = await redis.get(cacheKey);
    
    // Parse if string
    if (cached && typeof cached === 'string') {
      try {
        cached = JSON.parse(cached);
      } catch (e) {
        return NextResponse.json({ 
          error: "Cache parse error",
          events: [], 
          count: 0 
        }, { status: 500 });
      }
    }
    
    if (cached && typeof cached === 'object' && 'events' in cached) {
      return NextResponse.json(cached);
    }

    // No cache
    return NextResponse.json({ 
      events: [], 
      count: 0
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, events: [], count: 0 },
      { status: 500 }
    );
  }
}
