import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, MarketplaceConnection } from "@/lib/redis";
import {
  createContext,
  createSession,
  reconnectSession,
  releaseSession,
} from "@/lib/browserbase";

export const maxDuration = 120;

const VERIFY_URLS = {
  mercari: "https://www.mercari.com/mypage/",
  facebook: "https://www.facebook.com/marketplace/you/selling/",
} as const;

// Playwright cookie shape — matches what popular "Cookie-Editor" extension exports
interface ImportedCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  expirationDate?: number; // Cookie-Editor sometimes uses this
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

function normalizeCookies(raw: any[]): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}> {
  return raw
    .filter((c) => c && c.name && c.value !== undefined && c.domain)
    .map((c: ImportedCookie) => {
      let sameSite: "Strict" | "Lax" | "None" | undefined;
      if (typeof c.sameSite === "string") {
        const s = c.sameSite.toLowerCase();
        if (s === "strict") sameSite = "Strict";
        else if (s === "lax") sameSite = "Lax";
        else if (s === "none" || s === "no_restriction") sameSite = "None";
      }
      const expires =
        typeof c.expires === "number"
          ? c.expires
          : typeof c.expirationDate === "number"
          ? Math.floor(c.expirationDate)
          : undefined;
      return {
        name: c.name,
        value: String(c.value),
        domain: c.domain,
        path: c.path || "/",
        ...(expires && expires > 0 ? { expires } : {}),
        httpOnly: !!c.httpOnly,
        secure: c.secure ?? true,
        ...(sameSite ? { sameSite } : { sameSite: "Lax" as const }),
      };
    });
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { platform, cookies, localStorage: lsEntries, origin } = await request.json();
    if (!platform || !["mercari", "facebook"].includes(platform)) {
      return Response.json({ error: "Invalid platform" }, { status: 400 });
    }
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return Response.json({ error: "cookies array is required" }, { status: 400 });
    }

    const normalized = normalizeCookies(cookies);
    if (normalized.length === 0) {
      return Response.json(
        { error: "No valid cookies in payload — expected array of {name,value,domain,...}" },
        { status: 400 }
      );
    }
    const localStoragePairs: Record<string, string> =
      lsEntries && typeof lsEntries === "object" && !Array.isArray(lsEntries)
        ? lsEntries
        : {};
    const lsOrigin = typeof origin === "string" ? origin : `https://www.${platform}.com`;

    const redis = getRedis();
    const existingRaw = await redis.get(REDIS_KEYS.marketplaceConnection(platform));
    const existing: MarketplaceConnection | null = existingRaw
      ? typeof existingRaw === "string"
        ? JSON.parse(existingRaw)
        : (existingRaw as MarketplaceConnection)
      : null;

    const contextId = existing?.contextId || (await createContext());

    // Create a persist:true session, install cookies, navigate to verify page
    const session = await createSession({
      contextId,
      persist: true,
      keepAlive: false,
      timeout: 120,
    });

    let isLoggedIn = false;
    let finalUrl = "";
    let debugInfo = "";
    try {
      const { browser, context, page } = await reconnectSession(session.id);
      await context.addCookies(normalized as any);

      // If localStorage was provided, first navigate to the origin so localStorage is scoped,
      // inject values, then navigate to the verify URL.
      if (Object.keys(localStoragePairs).length > 0) {
        await page.goto(lsOrigin, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.evaluate((entries) => {
          for (const [k, v] of Object.entries(entries as Record<string, string>)) {
            try {
              window.localStorage.setItem(k, v);
            } catch {}
          }
        }, localStoragePairs);
      }

      await page.goto(VERIFY_URLS[platform as keyof typeof VERIFY_URLS], {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      finalUrl = page.url();
      isLoggedIn = !finalUrl.includes("/login") && !finalUrl.includes("/signin");
      // Capture a bit of debug info
      try {
        const title = await page.title();
        const cookieNames = (await context.cookies()).map((c) => c.name).slice(0, 40).join(",");
        debugInfo = `title="${title}" | cookies=${cookieNames}`;
      } catch {}
      console.log("Import verify:", finalUrl, debugInfo);
      await browser.close();
    } finally {
      // Wait briefly so Browserbase commits the context, then release
      await new Promise((r) => setTimeout(r, 2000));
      await releaseSession(session.id);
    }

    const connection: MarketplaceConnection = {
      platform: platform as "mercari" | "facebook",
      profileName: `${platform}-session`,
      connected: isLoggedIn,
      lastValidated: new Date().toISOString(),
      contextId,
      error: isLoggedIn
        ? undefined
        : `Cookies imported (${normalized.length}) + ${Object.keys(localStoragePairs).length} localStorage entries, but login verification failed. Ended on ${finalUrl}. ${debugInfo}`,
    };
    await redis.set(
      REDIS_KEYS.marketplaceConnection(platform),
      JSON.stringify(connection)
    );

    return Response.json({
      connection,
      imported: normalized.length,
      verifyUrl: finalUrl,
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("Import cookies error:", msg, error?.stack?.substring(0, 1000));
    return Response.json(
      { error: "Failed to import cookies: " + msg.substring(0, 300), details: msg },
      { status: 500 }
    );
  }
}
