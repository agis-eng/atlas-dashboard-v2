import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Check env vars
    const hasRedisUrl = !!process.env.UPSTASH_REDIS_REST_URL;
    const hasRedisToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
    const hasSessionSecret = !!process.env.SESSION_SECRET;

    if (!hasRedisUrl || !hasRedisToken) {
      return NextResponse.json({
        error: "Missing Redis env vars",
        hasRedisUrl,
        hasRedisToken,
        hasSessionSecret,
      }, { status: 500 });
    }

    if (!hasSessionSecret) {
      return NextResponse.json({
        error: "Missing SESSION_SECRET",
        hasRedisUrl,
        hasRedisToken,
        hasSessionSecret,
      }, { status: 500 });
    }

    // Try to connect to Redis
    try {
      const redis = getRedis();
      const userId = await redis.get(`user:email:${email.toLowerCase().trim()}`);
      
      if (!userId) {
        return NextResponse.json({
          error: "User not found in Redis",
          email: email.toLowerCase().trim(),
          hasRedisUrl,
          hasRedisToken,
          hasSessionSecret,
        }, { status: 404 });
      }

      const user = await redis.get(`user:${userId}`);
      
      return NextResponse.json({
        success: true,
        userFound: !!user,
        userId,
        email,
        hasRedisUrl,
        hasRedisToken,
        hasSessionSecret,
      });
    } catch (redisErr) {
      return NextResponse.json({
        error: "Redis connection failed",
        message: redisErr instanceof Error ? redisErr.message : String(redisErr),
        hasRedisUrl,
        hasRedisToken,
        hasSessionSecret,
      }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({
      error: "Unexpected error",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
