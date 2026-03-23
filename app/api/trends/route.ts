import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { TrendingItem } from "@/types/trends";

const TOPICS_PATH = join(process.cwd(), "data", "trends-topics.yaml");

interface Topic {
  id: string;
  name: string;
  keywords: string[];
  platforms: ("x" | "reddit" | "youtube")[];
  active: boolean;
}

async function fetchPlatform(
  platform: "x" | "reddit" | "youtube",
  keyword: string,
  topicId: string,
  baseUrl: string
): Promise<TrendingItem[]> {
  try {
    const res = await fetch(
      `${baseUrl}/api/trends/${platform}?keyword=${encodeURIComponent(keyword)}&topicId=${encodeURIComponent(topicId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicFilter = searchParams.get("topicId");
  const platformFilter = searchParams.get("platform") as "x" | "reddit" | "youtube" | null;

  let topics: Topic[] = [];
  try {
    const contents = await readFile(TOPICS_PATH, "utf8");
    const data = yaml.load(contents) as { topics: Topic[] };
    topics = data?.topics || [];
  } catch {
    return Response.json({ items: [], error: "Failed to load topics" });
  }

  const activeTopics = topics.filter(
    (t) => t.active && (!topicFilter || t.id === topicFilter)
  );

  // Derive base URL from request for internal calls
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const allItems: TrendingItem[] = [];

  await Promise.all(
    activeTopics.map(async (topic) => {
      const keyword = topic.keywords[0]; // Use primary keyword
      const platforms = platformFilter
        ? topic.platforms.filter((p) => p === platformFilter)
        : topic.platforms;

      await Promise.all(
        platforms.map(async (platform) => {
          const items = await fetchPlatform(platform, keyword, topic.id, baseUrl);
          allItems.push(...items);
        })
      );
    })
  );

  // Sort by timestamp descending
  allItems.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return Response.json({ items: allItems });
}
