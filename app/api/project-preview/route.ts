import { getRedis, REDIS_KEYS } from "@/lib/redis";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const CACHE_TTL = 60 * 60 * 24; // 24 hours

async function launchBrowser() {
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const localPuppeteer = await import("puppeteer");
  return localPuppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return Response.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const redis = getRedis();
    const cacheKey = REDIS_KEYS.projectPreview(url);

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      const data = typeof cached === "string" ? cached : JSON.stringify(cached);
      return new Response(Buffer.from(data, "base64"), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const imageBuffer = await page.screenshot({ encoding: "base64" });
    await browser.close();

    // Cache for 24h
    await redis.set(cacheKey, imageBuffer as string, { ex: CACHE_TTL });

    return new Response(Buffer.from(imageBuffer as string, "base64"), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Project preview error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to capture preview" },
      { status: 500 }
    );
  }
}
