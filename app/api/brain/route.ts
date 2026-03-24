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
  const dir = path.dirname(BRAINS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(BRAINS_FILE, yaml.stringify(data));
}

export async function GET() {
  try {
    const data = readBrains();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error reading brains:", error);
    return NextResponse.json(
      { error: "Failed to read brains" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, icon, description, schedule } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const data = readBrains();
    
    // Generate ID from name
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    
    // Check if ID already exists
    if (data.brains.find((b: any) => b.id === id)) {
      return NextResponse.json(
        { error: "A brain with this name already exists" },
        { status: 400 }
      );
    }

    const newBrain = {
      id,
      name,
      icon: icon || "🧠",
      description: description || "",
      schedule: schedule || "daily",
      email_sources: [],
      created: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    data.brains.push(newBrain);
    writeBrains(data);

    // Create brain directory
    const brainDir = path.join(process.cwd(), "data", "brains", id);
    fs.mkdirSync(path.join(brainDir, "summaries"), { recursive: true });
    fs.mkdirSync(path.join(brainDir, "documents"), { recursive: true });
    
    // Create empty knowledge base file
    fs.writeFileSync(
      path.join(brainDir, "knowledge-base.md"),
      `# ${name}\n\n${description}\n\n---\n\n`
    );

    return NextResponse.json(newBrain, { status: 201 });
  } catch (error) {
    console.error("Error creating brain:", error);
    return NextResponse.json(
      { error: "Failed to create brain" },
      { status: 500 }
    );
  }
}
