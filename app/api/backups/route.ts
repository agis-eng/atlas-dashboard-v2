import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSessionUserFromRequest } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user || user.profile !== 'erik') {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
    }

    const redis = getRedis();
    
    // Get all backup metadata from Redis
    const keys = await redis.keys('backup:*');
    const backups = [];
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        backups.push({
          id: key.replace('backup:', ''),
          ...data
        });
      }
    }
    
    // Sort by timestamp descending
    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return NextResponse.json({ backups, count: backups.length });
  } catch (error: any) {
    console.error('[Backups API] Error:', error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user || user.profile !== 'erik') {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
    }

    // Trigger backup manually
    const { stdout, stderr } = await execPromise(
      'node /Users/eriklaine/.openclaw/workspace/scripts/dashboard-health-backup.js'
    );
    
    return NextResponse.json({ 
      success: true,
      message: "Backup started",
      output: stdout
    });
  } catch (error: any) {
    console.error('[Backups API] Backup error:', error);
    return NextResponse.json(
      { error: error.message || "Backup failed" },
      { status: 500 }
    );
  }
}
