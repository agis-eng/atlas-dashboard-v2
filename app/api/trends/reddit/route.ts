import { TrendingItem } from "@/types/trends";

// Mock data — replace with real Reddit API calls once keys are added
// Reddit API: https://www.reddit.com/r/{subreddit}/search.json or /r/all/search.json
// Env vars needed: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET

const SUBREDDIT_MAP: Record<string, string[]> = {
  "artificial intelligence": ["r/artificial", "r/MachineLearning"],
  "machine learning": ["r/MachineLearning", "r/learnmachinelearning"],
  llm: ["r/LocalLLaMA", "r/ChatGPT"],
  startup: ["r/startups", "r/Entrepreneur"],
  saas: ["r/SaaS", "r/startups"],
  ecommerce: ["r/ecommerce", "r/Flipping"],
  ebay: ["r/Flipping", "r/Ebay"],
  nextjs: ["r/nextjs", "r/webdev"],
  react: ["r/reactjs", "r/webdev"],
  typescript: ["r/typescript", "r/webdev"],
  default: ["r/technology", "r/programming"],
};

function getSubreddits(keyword: string): string[] {
  const lower = keyword.toLowerCase();
  for (const [key, subs] of Object.entries(SUBREDDIT_MAP)) {
    if (lower.includes(key)) return subs;
  }
  return SUBREDDIT_MAP.default;
}

function generateMockRedditPosts(keyword: string, topicId: string): TrendingItem[] {
  const subreddits = getSubreddits(keyword);
  const mockPosts = [
    {
      title: `[Discussion] What's everyone's take on the current state of ${keyword}?`,
      author: "u/curious_dev",
      subreddit: subreddits[0],
      engagement: { likes: 2847, comments: 634, views: undefined },
    },
    {
      title: `I built a ${keyword} tool in a weekend and it hit $5k MRR in 30 days — AMA`,
      author: "u/indie_builder",
      subreddit: subreddits[0],
      engagement: { likes: 8921, comments: 1203, views: undefined },
    },
    {
      title: `Resources for getting started with ${keyword} in 2026 (curated list)`,
      author: "u/resource_curator",
      subreddit: subreddits[1] || subreddits[0],
      engagement: { likes: 1456, comments: 89, views: undefined },
    },
    {
      title: `Hot: Why ${keyword} is about to be disrupted by a completely different approach`,
      author: "u/contrarian_takes",
      subreddit: subreddits[1] || subreddits[0],
      engagement: { likes: 3201, comments: 892, views: undefined },
    },
  ];

  return mockPosts.map((p, i) => ({
    id: `reddit_${topicId}_${i}_${Date.now()}`,
    topicId,
    platform: "reddit" as const,
    title: p.title,
    author: p.author,
    url: `https://reddit.com/search/?q=${encodeURIComponent(keyword)}&sort=hot`,
    engagement: p.engagement,
    timestamp: new Date(Date.now() - i * 3600000 * Math.random() * 6).toISOString(),
    thumbnail: undefined,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const topicId = searchParams.get("topicId") || "unknown";

  // TODO: Replace with real Reddit API once REDDIT_CLIENT_ID/SECRET are set
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    // Real implementation:
    // 1. Get access token via client credentials
    // 2. Search: GET https://oauth.reddit.com/r/all/search?q={keyword}&sort=hot&limit=10
  }

  const items = generateMockRedditPosts(keyword, topicId);
  return Response.json({ items, mock: true });
}
