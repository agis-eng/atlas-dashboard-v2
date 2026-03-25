import { NextRequest, NextResponse } from "next/server";
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

    const filepath = path.join(BACKUP_DIR, params.id);
    
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }
    
    const file = fs.readFileSync(filepath);
    
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${params.id}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
