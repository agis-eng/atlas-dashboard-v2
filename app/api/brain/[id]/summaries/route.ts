import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const summariesDir = path.join(
      process.cwd(),
      "data",
      "brains",
      id,
      "summaries"
    );

    if (!fs.existsSync(summariesDir)) {
      return NextResponse.json({ summaries: [] });
    }

    const files = fs.readdirSync(summariesDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse(); // Most recent first

    const summaries = files.map(file => {
      const content = fs.readFileSync(path.join(summariesDir, file), 'utf-8');
      const date = file.replace('.md', '');
      
      // Extract first few lines as preview
      const lines = content.split('\n');
      const preview = lines.slice(0, 5).join('\n');
      
      return {
        date,
        file,
        preview,
        content
      };
    });

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("Error reading summaries:", error);
    return NextResponse.json(
      { error: "Failed to read summaries" },
      { status: 500 }
    );
  }
}
