import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSessionUserFromRequest } from "@/lib/auth";
import fs from "fs";
import path from "path";

const BACKUP_DIR = path.join(process.cwd(), '../data/backups');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user || user.profile !== 'erik') {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
    }

    const redis = getRedis();
    const metadata = await redis.get(`backup:${params.id}`);
    
    if (!metadata) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    return NextResponse.json({ backup: metadata });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user || user.profile !== 'erik') {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
    }

    const redis = getRedis();
    
    // Delete from Redis
    await redis.del(`backup:${params.id}`);
    
    // Delete from filesystem
    const filepath = path.join(BACKUP_DIR, params.id);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user || user.profile !== 'erik') {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
    }

    const { action } = await request.json();
    
    if (action === 'restore') {
      // Read backup file
      const filepath = path.join(BACKUP_DIR, params.id);
      
      if (!fs.existsSync(filepath)) {
        return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
      }
      
      const backup = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      const redis = getRedis();
      
      // Restore Redis data
      let restored = 0;
      for (const [key, value] of Object.entries(backup.redis)) {
        await redis.set(key, value);
        restored++;
      }
      
      return NextResponse.json({ 
        success: true,
        restored: {
          redis: restored,
          files: 0 // Files need manual restoration
        }
      });
    }
    
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
