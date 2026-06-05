import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

function getBrainsKey(userId: string) {
  return `brains:${userId}`;
}

// Normalize stored brains so consumers never crash on missing fields.
// Brains created via /quick-add and /api/research/ingest don't set
// email_sources / schedule / icon, which crashed the /brain pages
// (e.g. `brain.email_sources.length` on undefined). Coerce here once.
function normalizeBrain(b: any) {
  return {
    ...b,
    id: b?.id,
    name: b?.name ?? "Untitled Brain",
    icon: b?.icon ?? "🧠",
    description: b?.description ?? "",
    schedule: b?.schedule ?? "manual",
    email_sources: Array.isArray(b?.email_sources) ? b.email_sources : [],
    documents: Array.isArray(b?.documents) ? b.documents : [],
    links: Array.isArray(b?.links) ? b.links : [],
    notes: Array.isArray(b?.notes) ? b.notes : [],
    created: b?.created ?? null,
    lastUpdated: b?.lastUpdated ?? b?.created ?? null,
  };
}

async function readBrains(userId: string) {
  const redis = getRedis();
  const data = (await redis.get(getBrainsKey(userId))) as { brains?: any[] } | null;

  const raw = data && Array.isArray(data.brains) ? data.brains : [];
  return { brains: raw.filter(Boolean).map(normalizeBrain) };
}

async function writeBrains(userId: string, data: any) {
  const redis = getRedis();
  await redis.set(getBrainsKey(userId), data);
}

export async function GET(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await readBrains(user.profile);
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
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, icon, description, schedule } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const data = await readBrains(user.profile);
    
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
    await writeBrains(user.profile, data);

    return NextResponse.json(newBrain, { status: 201 });
  } catch (error) {
    console.error("Error creating brain:", error);
    return NextResponse.json(
      { error: "Failed to create brain" },
      { status: 500 }
    );
  }
}
