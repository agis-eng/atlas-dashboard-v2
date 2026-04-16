import { Browserbase } from "@browserbasehq/sdk";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const API_KEY = process.env.BROWSERBASE_API_KEY || "";
const PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || "";

export function getBrowserbase(): Browserbase {
  if (!API_KEY) throw new Error("BROWSERBASE_API_KEY is not set");
  return new Browserbase({ apiKey: API_KEY });
}

export function requireProjectId(): string {
  if (!PROJECT_ID) throw new Error("BROWSERBASE_PROJECT_ID is not set");
  return PROJECT_ID;
}

export interface BBSessionInfo {
  id: string;
  connectUrl: string;
  liveViewUrl: string;
}

/** Create a Browserbase context. Use this once per (user, platform). */
export async function createContext(): Promise<string> {
  const bb = getBrowserbase();
  const ctx = await bb.contexts.create({ projectId: requireProjectId() });
  return ctx.id;
}

/**
 * Create a browser session. If contextId is provided, the session uses that
 * context (login cookies persist). keepAlive=true lets the session survive
 * across multiple HTTP requests; the caller must explicitly release.
 */
export async function createSession(opts: {
  contextId?: string;
  persist?: boolean;
  keepAlive?: boolean;
  timeout?: number;
  /** Use residential proxies + advanced stealth. Needed for OAuth flows (Google/Facebook login). */
  stealth?: boolean;
}): Promise<BBSessionInfo> {
  const bb = getBrowserbase();
  const browserSettings: any = {};
  if (opts.contextId) {
    browserSettings.context = {
      id: opts.contextId,
      persist: opts.persist ?? false,
    };
  }
  // Basic fingerprint (free tier). Makes us look like a typical desktop browser.
  // NOTE: Proxies + advancedStealth require paid plans, so OAuth (Google/Facebook)
  // login may be blocked. Use email/password instead.
  browserSettings.fingerprint = {
    devices: ["desktop"],
    locales: ["en-US"],
  };
  browserSettings.viewport = { width: 1366, height: 900 };
  const session = await bb.sessions.create({
    projectId: requireProjectId(),
    browserSettings,
    keepAlive: opts.keepAlive ?? false,
    timeout: opts.timeout ?? 600,
  } as any);

  const debug = await bb.sessions.debug(session.id);

  return {
    id: session.id,
    connectUrl: session.connectUrl,
    liveViewUrl: debug.debuggerFullscreenUrl || debug.debuggerUrl,
  };
}

/** Release a session that was created with keepAlive: true. */
export async function releaseSession(sessionId: string): Promise<void> {
  try {
    const bb = getBrowserbase();
    await bb.sessions.update(sessionId, {
      projectId: requireProjectId(),
      status: "REQUEST_RELEASE",
    });
  } catch (err) {
    console.error("Failed to release session:", err);
  }
}

/** Connect Playwright to an existing Browserbase session via CDP. */
export async function connectSession(connectUrl: string): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const browser = await chromium.connectOverCDP(connectUrl);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[0] || (await context.newPage());
  return { browser, context, page };
}

/** Reconnect to an active session by sessionId. */
export async function reconnectSession(sessionId: string): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
  liveViewUrl: string;
}> {
  const bb = getBrowserbase();
  const session = await bb.sessions.retrieve(sessionId);
  if (!session.connectUrl) {
    throw new Error("Session has no connect URL — it may have expired");
  }
  const debug = await bb.sessions.debug(sessionId);
  const { browser, context, page } = await connectSession(session.connectUrl);
  return {
    browser,
    context,
    page,
    liveViewUrl: debug.debuggerFullscreenUrl || debug.debuggerUrl,
  };
}
