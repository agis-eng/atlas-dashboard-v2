import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "30");
    
    const memoryDir = path.join(process.cwd(), "data", "memory");
    
    if (!fs.existsSync(memoryDir)) {
      return NextResponse.json({ summaries: [] });
    }
    
    // Read all JSON files
    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse() // Most recent first
      .slice(0, limit);
    
    const summaries = files.map(file => {
      const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8');
      return JSON.parse(content);
    });
    
    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("Error reading daily summaries:", error);
    return NextResponse.json(
      { error: "Failed to read daily summaries" },
      { status: 500 }
    );
  }
}
