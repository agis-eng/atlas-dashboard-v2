import { NextRequest } from "next/server";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";

interface SearchResult {
  id: string;
  platform: "youtube";
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  author: string;
  publishedAt: string;
  engagement: {
    views?: number;
    likes?: number;
    comments?: number;
  };
  duration?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const maxResults = parseInt(searchParams.get("max") || "15");

  if (!query) {
    return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  if (!YOUTUBE_API_KEY) {
    return Response.json({ error: "YouTube API key not configured" }, { status: 500 });
  }

  const results: SearchResult[] = [];

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${maxResults}&order=relevance&key=${YOUTUBE_API_KEY}`
    );
    const searchData = await searchRes.json();

    if (searchData.error) {
      return Response.json({ error: `YouTube: ${searchData.error.message}` }, { status: 500 });
    }

    if (searchData.items?.length) {
      const videoIds = searchData.items.map((item: any) => item.id.videoId).join(",");
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`
      );
      const statsData = await statsRes.json();
      const statsMap: Record<string, any> = {};
      statsData.items?.forEach((item: any) => {
        statsMap[item.id] = {
          views: parseInt(item.statistics?.viewCount || "0"),
          likes: parseInt(item.statistics?.likeCount || "0"),
          comments: parseInt(item.statistics?.commentCount || "0"),
          duration: item.contentDetails?.duration || "",
        };
      });

      for (const item of searchData.items) {
        const videoId = item.id.videoId;
        const stats = statsMap[videoId] || {};
        results.push({
          id: `yt-${videoId}`,
          platform: "youtube",
          title: item.snippet.title,
          description: item.snippet.description,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
          author: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          engagement: {
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
          },
          duration: formatDuration(stats.duration),
        });
      }
    }
  } catch (err) {
    return Response.json(
      { error: `YouTube search failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }

  results.sort((a, b) => {
    const scoreA = (a.engagement.views || 0) * 0.01 + (a.engagement.likes || 0) + (a.engagement.comments || 0) * 2;
    const scoreB = (b.engagement.views || 0) * 0.01 + (b.engagement.likes || 0) + (b.engagement.comments || 0) * 2;
    return scoreB - scoreA;
  });

  return Response.json({ results });
}

function formatDuration(isoDuration: string): string {
  if (!isoDuration) return "";
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const h = match[1] ? `${match[1]}:` : "";
  const m = match[2] || "0";
  const s = (match[3] || "0").padStart(2, "0");
  return h ? `${h}${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
}
