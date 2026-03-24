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
    const { type, sender } = await request.json();

    const data = readBrains();
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    // Add email source if not already present
    if (type === "email" && sender) {
      if (!brain.email_sources) {
        brain.email_sources = [];
      }
      
      if (!brain.email_sources.includes(sender)) {
        brain.email_sources.push(sender);
        brain.lastUpdated = new Date().toISOString().split('T')[0];
        writeBrains(data);
      }
    }

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error adding source to brain:", error);
    return NextResponse.json(
      { error: "Failed to add source" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { sender } = await request.json();

    const data = readBrains();
    const brain = data.brains.find((b: any) => b.id === id);

    if (!brain) {
      return NextResponse.json(
        { error: "Brain not found" },
        { status: 404 }
      );
    }

    if (brain.email_sources) {
      brain.email_sources = brain.email_sources.filter((s: string) => s !== sender);
      brain.lastUpdated = new Date().toISOString().split('T')[0];
      writeBrains(data);
    }

    return NextResponse.json(brain);
  } catch (error) {
    console.error("Error removing source:", error);
    return NextResponse.json(
      { error: "Failed to remove source" },
      { status: 500 }
    );
  }
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

    return NextResponse.json({
      email_sources: brain.email_sources || [],
      documents: brain.documents || [],
      links: brain.links || [],
      notes: brain.notes || []
    });
  } catch (error) {
    console.error("Error reading brain sources:", error);
    return NextResponse.json(
      { error: "Failed to read sources" },
      { status: 500 }
    );
  }
}
