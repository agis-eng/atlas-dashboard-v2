import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSessionUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: [] as any[]
    };

    // Test Redis
    try {
      const redis = getRedis();
      await redis.ping();
      results.checks.push({ name: 'Redis', status: 'ok' });
    } catch (err) {
      results.checks.push({ name: 'Redis', status: 'error', error: (err as Error).message });
      results.status = 'unhealthy';
    }

    // Test API endpoints (basic)
    const endpoints = [
      '/api/calendar/calendars',
      '/api/calendar/events',
      '/api/projects',
      '/api/brain',
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${endpoint}`, {
          headers: {
            'Cookie': request.headers.get('cookie') || ''
          }
        });
        
        results.checks.push({
          name: endpoint,
          status: res.ok ? 'ok' : 'error',
          code: res.status
        });
        
        if (!res.ok && results.status === 'healthy') {
          results.status = 'degraded';
        }
      } catch (err) {
        results.checks.push({
          name: endpoint,
          status: 'error',
          error: (err as Error).message
        });
        results.status = 'degraded';
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error.message || "Health check failed",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
