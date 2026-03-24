import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import yaml from "yaml";

const BRAINS_FILE = path.join(process.cwd(), "data", "brains.yaml");

function readBrains() {
  if (!fs.existsSync(BRAINS_FILE)) {
    return { brains: [] };
  }
  const content = fs.readFileSync(BRAINS_FILE, "utf-8");
  return yaml.parse(content) || { brains: [] };
}

function writeBrains(data: any) {
  fs.writeFileSync(BRAINS_FILE, yaml.stringify(data));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { url, title } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    const data = readBrains();
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    if (!brain.links) {
      brain.links = [];
    }

    brain.links.push({
      url,
      title: title || url,
      saved: new Date().toISOString()
    });

    brain.lastUpdated = new Date().toISOString().split('T')[0];
    writeBrains(data);

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error adding link:", error);
    return NextResponse.json(
      { error: "Failed to add link" },
      { status: 500 }
    );
  }
}
