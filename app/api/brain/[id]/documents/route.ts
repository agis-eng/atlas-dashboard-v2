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
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
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

    // Create documents directory
    const docsDir = path.join(process.cwd(), "data", "brains", id, "documents");
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;
    const filepath = path.join(docsDir, filename);
    fs.writeFileSync(filepath, buffer);

    // Update brain metadata
    if (!brain.documents) {
      brain.documents = [];
    }

    brain.documents.push({
      name: filename,
      path: `documents/${filename}`,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString()
    });

    brain.lastUpdated = new Date().toISOString().split('T')[0];
    writeBrains(data);

    return NextResponse.json({ 
      success: true, 
      document: brain.documents[brain.documents.length - 1]
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
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
      documents: brain.documents || []
    });
  } catch (error) {
    console.error("Error reading documents:", error);
    return NextResponse.json(
      { error: "Failed to read documents" },
      { status: 500 }
    );
  }
}
