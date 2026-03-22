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
