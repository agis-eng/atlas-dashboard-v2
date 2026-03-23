import { TrendingItem } from "@/types/trends";

// Mock data — replace with real YouTube Data API v3 calls once key is added
// YouTube API: https://www.googleapis.com/youtube/v3/search
// Env vars needed: YOUTUBE_API_KEY

function formatViews(n: number): number {
  return n;
}

function generateMockYouTubeVideos(keyword: string, topicId: string): TrendingItem[] {
  const mockVideos = [
    {
      title: `${keyword} Explained: Everything You Need to Know in 2026`,
      author: "TechCrunch",
      views: 892100,
      likes: 34200,
      comments: 2103,
      thumbnail: `https://picsum.photos/seed/${keyword}1/320/180`,
    },
    {
      title: `I Tested 10 ${keyword} Tools So You Don't Have To`,
      author: "MKBHD",
      views: 1240000,
      likes: 67800,
      comments: 4512,
      thumbnail: `https://picsum.photos/seed/${keyword}2/320/180`,
    },
    {
      title: `The Truth About ${keyword} That Nobody Talks About`,
      author: "Fireship",
      views: 456000,
      likes: 28900,
      comments: 1876,
      thumbnail: `https://picsum.photos/seed/${keyword}3/320/180`,
    },
    {
      title: `Build a ${keyword} App From Scratch — Full Tutorial`,
      author: "Traversy Media",
      views: 234500,
      likes: 12300,
      comments: 876,
      thumbnail: `https://picsum.photos/seed/${keyword}4/320/180`,
    },
  ];

  return mockVideos.map((v, i) => ({
    id: `yt_${topicId}_${i}_${Date.now()}`,
    topicId,
    platform: "youtube" as const,
    title: v.title,
    author: v.author,
    url: `https://youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
    thumbnail: v.thumbnail,
    engagement: {
      views: formatViews(v.views),
      likes: v.likes,
      comments: v.comments,
    },
    timestamp: new Date(Date.now() - i * 3600000 * Math.random() * 24).toISOString(),
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const topicId = searchParams.get("topicId") || "unknown";

  // TODO: Replace with real YouTube API once YOUTUBE_API_KEY is set
  if (process.env.YOUTUBE_API_KEY) {
    // Real implementation:
    // const res = await fetch(
    //   `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=viewCount&maxResults=10&key=${process.env.YOUTUBE_API_KEY}`
    // );
    // const data = await res.json();
    // return Response.json({ items: mapYouTubeResponse(data, topicId) });
  }

  const items = generateMockYouTubeVideos(keyword, topicId);
  return Response.json({ items, mock: true });
}
