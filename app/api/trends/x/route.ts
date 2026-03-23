import { TrendingItem } from "@/types/trends";

// Mock data — replace with real X/Twitter API calls once keys are added
// X API v2: https://api.twitter.com/2/tweets/search/recent
// Env vars needed: X_BEARER_TOKEN

function generateMockXTrends(keyword: string, topicId: string): TrendingItem[] {
  const mockTweets = [
    {
      title: `The future of ${keyword} is here — and it's moving faster than anyone expected`,
      author: "@techinsider",
      engagement: { likes: 4821, views: 89200, comments: 312 },
    },
    {
      title: `Hot take: most ${keyword} companies are just copying each other and calling it innovation`,
      author: "@foundermindset",
      engagement: { likes: 2103, views: 41500, comments: 887 },
    },
    {
      title: `We just shipped a major update to our ${keyword} stack. Thread on what we learned 🧵`,
      author: "@buildingpublicly",
      engagement: { likes: 1567, views: 28300, comments: 203 },
    },
    {
      title: `${keyword} jobs are up 43% YoY. Here are the skills that actually matter right now`,
      author: "@careertracker",
      engagement: { likes: 3290, views: 67800, comments: 445 },
    },
  ];

  return mockTweets.map((t, i) => ({
    id: `x_${topicId}_${i}_${Date.now()}`,
    topicId,
    platform: "x" as const,
    title: t.title,
    author: t.author,
    url: `https://x.com/search?q=${encodeURIComponent(keyword)}`,
    engagement: t.engagement,
    timestamp: new Date(Date.now() - i * 3600000 * Math.random() * 4).toISOString(),
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const topicId = searchParams.get("topicId") || "unknown";

  // TODO: Replace with real X API once X_BEARER_TOKEN is set
  if (process.env.X_BEARER_TOKEN) {
    // Real implementation:
    // const res = await fetch(
    //   `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(keyword)}&max_results=10&tweet.fields=public_metrics,created_at&expansions=author_id&user.fields=username`,
    //   { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } }
    // );
    // const data = await res.json();
    // return Response.json({ items: mapXResponse(data, topicId) });
  }

  // Return mock data
  const items = generateMockXTrends(keyword, topicId);
  return Response.json({ items, mock: true });
}
