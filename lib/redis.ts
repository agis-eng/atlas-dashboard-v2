import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

// Redis key patterns used across the dashboard
export const REDIS_KEYS = {
  // Chat
  chatMessages: (sessionId: string) => `chat:messages:${sessionId}`,
  chatSessions: (profile: string) => `chat:sessions:${profile}`,
  chatSessionMeta: (sessionId: string) => `chat:session:${sessionId}:meta`,

  // Projects
  projects: (profile: string) => `projects:${profile}`,
  projectDetail: (id: string) => `project:${id}`,

  // Profile
  currentProfile: "profile:current",

  // Tasks
  tasks: (profile: string) => `tasks:${profile}`,

  // Activity
  recentActivity: (profile: string) => `activity:recent:${profile}`,

  // Email
  emailSettings: (userId: string) => `email:settings:${userId}`,
  emailCache: (userId: string, account: string) => `email:inbox:${userId}:${account}`,
  emailState: (msgId: string) => `email:state:${msgId}`,
  emailSnooze: (userId: string) => `email:snooze:${userId}`,
  emailTemplates: (userId: string) => `email:templates:${userId}`,

  // Auth
  user: (userId: string) => `user:${userId}`,
  userByEmail: (email: string) => `user:email:${email.toLowerCase()}`,
  session: (sessionId: string) => `session:${sessionId}`,

  // Fathom Recordings
  fathomRecordings: "fathom:recordings",
  fathomTranscript: (id: string) => `fathom:transcript:${id}`,
  fathomSyncMeta: "fathom:sync:meta",

  // Memory / Daily Logs
  memoryEntries: (date: string) => `memory:entries:${date}`,
  memoryEntry: (id: string) => `memory:entry:${id}`,
  memoryDates: (profile: string) => `memory:dates:${profile}`,
  memoryByProject: (projectId: string) => `memory:project:${projectId}`,
  memoryTags: (profile: string) => `memory:tags:${profile}`,

  // Listings
  listings: "listings:all",
  listing: (id: string) => `listing:${id}`,

  // Marketplace connections
  marketplaceConnection: (platform: string) => `marketplace:connection:${platform}`,

  // Local Mac automation servers (tunnel URLs)
  mercariServerUrl: "mercari:server:url",
  transcriptServerUrl: "transcript:server:url",

  // eBay OAuth
  ebayToken: "ebay:oauth:token",
} as const;

// Types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  sessionId: string;
}

export interface ChatSession {
  id: string;
  title: string;
  profile: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  url?: string;
  screenshotUrl?: string;
  profile: string;
  status: "active" | "paused" | "completed";
  createdAt: number;
  updatedAt: number;
}

export type Profile = "erik" | "anton" | "all";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  profile: "erik" | "anton";
  createdAt: number;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface FathomRecording {
  id: string;
  title: string;
  date: string;
  duration?: number;
  participants: string[];
  attendeeEmails: string[];
  summary: string | null;
  actionItems: string[];
  url: string | null;
  projectId: string | null;
  projectName: string | null;
  suggestedProjectId?: string | null;
  suggestedProjectName?: string | null;
  matchConfidence?: "high" | "medium" | null;
  status: "pending" | "processed";
  receivedAt: string;
  source: "webhook" | "api-sync";
}

export interface FathomSyncMeta {
  lastSyncAt: string;
  totalImported: number;
  apiKeyConfigured: boolean;
}

export interface MemoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO 8601
  title: string;
  content: string;
  author: string; // Erik or Anton
  profile: "erik" | "anton";
  projectIds: string[];
  tags: string[];
  type: "discussion" | "decision" | "update" | "note";
}

export interface ListingDraft {
  id: string;
  photos: string[];
  title: string;
  description: string;
  price: number | null;
  quantity: number;
  condition: string;
  category: string;
  brand?: string;
  size?: string;
  sizeType?: string;
  platforms: ("ebay" | "mercari" | "facebook")[];
  status: "draft" | "analyzing" | "ready" | "listing" | "listed" | "error";
  ebayListingId?: string;
  ebayOfferId?: string;
  ebaySku?: string;
  mercariListingUrl?: string;
  facebookListingUrl?: string;
  aiAnalysis?: {
    suggestedTitle: string;
    suggestedDescription: string;
    suggestedPrice: number;
    suggestedCategory: string;
    suggestedCondition: string;
    suggestedBrand?: string;
    suggestedWeightOz?: number;
    suggestedLengthIn?: number;
    suggestedWidthIn?: number;
    suggestedHeightIn?: number;
    confidence: string;
  };
  // Package size + weight for shipping calculation
  weightOz?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  mercariStatus?: "pending" | "publishing" | "listed" | "error";
  facebookStatus?: "pending" | "publishing" | "listed" | "error";
  mercariError?: string;
  mercariFieldStatus?: string;
  facebookFieldStatus?: string;
  // Facebook Marketplace shipping: default is Facebook-managed shipping
  // (seller pays, free for buyer) plus local pickup. Set true for big items
  // that should be local pickup only.
  facebookLocalOnly?: boolean;
  facebookError?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceConnection {
  platform: "mercari" | "facebook";
  profileName: string;
  connected: boolean;
  lastValidated: string;
  username?: string;
  error?: string;
  // Browserbase context ID — persists login cookies across sessions
  contextId?: string;
}
