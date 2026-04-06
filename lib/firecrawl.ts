const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || "";
const BASE_URL = "https://api.firecrawl.dev/v2";

export interface FirecrawlProfile {
  name: string;
  saveChanges: boolean;
}

export const MERCARI_PROFILE: FirecrawlProfile = { name: "mercari-session", saveChanges: true };
export const FACEBOOK_PROFILE: FirecrawlProfile = { name: "facebook-session", saveChanges: true };

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      scrapeId?: string;
      url?: string;
      statusCode?: number;
      [key: string]: any;
    };
  };
  error?: string;
}

export interface FirecrawlInteractResult {
  success: boolean;
  data?: {
    output?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    liveViewUrl?: string;
    [key: string]: any;
  };
  error?: string;
}

export async function firecrawlScrape(
  url: string,
  options: {
    profile?: FirecrawlProfile;
    proxy?: "basic" | "stealth" | "enhanced" | "auto";
    waitFor?: number;
    formats?: string[];
  } = {}
): Promise<FirecrawlScrapeResult> {
  const res = await fetch(`${BASE_URL}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      url,
      formats: options.formats || ["markdown"],
      profile: options.profile,
      proxy: options.proxy || "stealth",
      waitFor: options.waitFor || 5000,
    }),
  });

  return res.json();
}

export async function firecrawlInteract(
  scrapeId: string,
  prompt: string,
  options: { timeout?: number } = {}
): Promise<FirecrawlInteractResult> {
  const res = await fetch(`${BASE_URL}/scrape/${scrapeId}/interact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      timeout: options.timeout || 45,
    }),
  });

  return res.json();
}

export async function firecrawlInteractStop(scrapeId: string): Promise<void> {
  await fetch(`${BASE_URL}/scrape/${scrapeId}/interact/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
  });
}

export interface FirecrawlBrowserResult {
  success: boolean;
  id?: string;
  cdpUrl?: string;
  liveViewUrl?: string;
  interactiveLiveViewUrl?: string;
  expiresAt?: string;
  error?: string;
}

export async function firecrawlBrowserCreate(
  options: {
    profile?: FirecrawlProfile;
    ttl?: number;
    activityTtl?: number;
  } = {}
): Promise<FirecrawlBrowserResult> {
  const res = await fetch(`${BASE_URL}/browser`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      ttl: options.ttl || 300,
      activityTtl: options.activityTtl || 300,
      profile: options.profile,
    }),
  });

  return res.json();
}

export async function firecrawlBrowserDelete(sessionId: string): Promise<void> {
  await fetch(`${BASE_URL}/browser/${sessionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
  });
}
