import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const BOOKMARKS_KEY = "trends:bookmarks";

interface Bookmark {
  id: string;
  itemId: string;
  savedAt: string;
}

async function loadBookmarks(): Promise<{ bookmarks: Bookmark[] }> {
  const redis = getRedis();
  const data = await redis.get(BOOKMARKS_KEY);
  
  if (!data || typeof data !== 'object') {
    return { bookmarks: [] };
  }
  
  return data as { bookmarks: Bookmark[] };
}

async function saveBookmarks(data: { bookmarks: Bookmark[] }) {
  const redis = getRedis();
  await redis.set(BOOKMARKS_KEY, data);
}

export async function GET() {
  const data = await loadBookmarks();
  return NextResponse.json({ bookmarks: data.bookmarks || [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { itemId } = body;

  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const data = await loadBookmarks();
  if (data.bookmarks.some((b) => b.itemId === itemId)) {
    return NextResponse.json({ error: "Already bookmarked" }, { status: 409 });
  }

  const bookmark: Bookmark = {
    id: `bk_${Date.now()}`,
    itemId,
    savedAt: new Date().toISOString(),
  };
  data.bookmarks.push(bookmark);
  await saveBookmarks(data);
  return NextResponse.json({ bookmark });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");

  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const data = await loadBookmarks();
  data.bookmarks = data.bookmarks.filter((b) => b.itemId !== itemId);
  await saveBookmarks(data);
  return NextResponse.json({ success: true });
}
