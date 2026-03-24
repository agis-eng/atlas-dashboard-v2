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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = readBrains();
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error reading brain:", error);
    return NextResponse.json(
      { error: "Failed to read brain" },
      { status: 500 }
    );
  }
}
