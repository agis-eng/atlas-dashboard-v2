import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const BRAINS_KEY = "brains:data";

async function readBrains() {
  const redis = getRedis();
  const data = await redis.get(BRAINS_KEY);
  
  if (!data || typeof data !== 'object') {
    return { brains: [] };
  }
  
  return data as { brains: any[] };
}

async function writeBrains(data: any) {
  const redis = getRedis();
  await redis.set(BRAINS_KEY, data);
}

export async function GET() {
  try {
    const data = await readBrains();
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

    const data = await readBrains();
    
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
    await writeBrains(data);

    return NextResponse.json(newBrain, { status: 201 });
  } catch (error) {
    console.error("Error creating brain:", error);
    return NextResponse.json(
      { error: "Failed to create brain" },
      { status: 500 }
    );
  }
}
