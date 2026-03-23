import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

const BOOKMARKS_PATH = join(process.cwd(), "data", "trends-bookmarks.yaml");

interface Bookmark {
  id: string;
  itemId: string;
  savedAt: string;
}

async function loadBookmarks(): Promise<{ bookmarks: Bookmark[] }> {
  try {
    const contents = await readFile(BOOKMARKS_PATH, "utf8");
    return (yaml.load(contents) as { bookmarks: Bookmark[] }) || { bookmarks: [] };
  } catch {
    return { bookmarks: [] };
  }
}

async function saveBookmarks(data: { bookmarks: Bookmark[] }) {
  const yamlStr = yaml.dump(data, { lineWidth: -1, noRefs: true });
  await writeFile(BOOKMARKS_PATH, yamlStr, "utf8");
}

export async function GET() {
  const data = await loadBookmarks();
  return Response.json({ bookmarks: data.bookmarks || [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { itemId } = body;

  if (!itemId) {
    return Response.json({ error: "itemId is required" }, { status: 400 });
  }

  const data = await loadBookmarks();
  if (data.bookmarks.some((b) => b.itemId === itemId)) {
    return Response.json({ error: "Already bookmarked" }, { status: 409 });
  }

  const bookmark: Bookmark = {
    id: `bk_${Date.now()}`,
    itemId,
    savedAt: new Date().toISOString(),
  };
  data.bookmarks.push(bookmark);
  await saveBookmarks(data);
  return Response.json({ bookmark });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");

  if (!itemId) {
    return Response.json({ error: "itemId is required" }, { status: 400 });
  }

  const data = await loadBookmarks();
  data.bookmarks = data.bookmarks.filter((b) => b.itemId !== itemId);
  await saveBookmarks(data);
  return Response.json({ success: true });
}
