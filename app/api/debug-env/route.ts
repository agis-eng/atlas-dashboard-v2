import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
    hasRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL?.substring(0, 30) + "...",
    tokenLength: process.env.UPSTASH_REDIS_REST_TOKEN?.length,
    secretLength: process.env.SESSION_SECRET?.length,
  });
}
