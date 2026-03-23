export interface Topic {
  id: string;
  name: string;
  keywords: string[];
  platforms: ("x" | "reddit" | "youtube")[];
  active: boolean;
}

export interface TrendingItem {
  id: string;
  topicId: string;
  platform: "x" | "reddit" | "youtube";
  title: string;
  author: string;
  url: string;
  thumbnail?: string;
  engagement: {
    likes?: number;
    views?: number;
    comments?: number;
  };
  timestamp: string;
}
