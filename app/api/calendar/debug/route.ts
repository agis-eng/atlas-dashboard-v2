import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSessionUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redis = getRedis();
    const cacheKey = `calendar:events:${user.profile}`;
    
    const cached = await redis.get(cacheKey);
    
    return NextResponse.json({
      cacheKey,
      hasData: !!cached,
      dataType: typeof cached,
      isNull: cached === null,
      isString: typeof cached === 'string',
      dataPreview: cached ? (typeof cached === 'string' ? cached.substring(0, 200) : JSON.stringify(cached).substring(0, 200)) : null,
      profile: user.profile
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
