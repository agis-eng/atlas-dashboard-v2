import { getRedis, REDIS_KEYS, type Screenshot } from "@/lib/redis";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

async function launchBrowser() {
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev: use regular puppeteer
  const localPuppeteer = await import("puppeteer");
  return localPuppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function POST(request: Request) {
  try {
    const { url, profile = "erik", title } = await request.json();

    if (!url) {
      return Response.json({ error: "Missing URL" }, { status: 400 });
    }

    const browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const imageBuffer = await page.screenshot({ encoding: "base64" });
    await browser.close();

    const redis = getRedis();
    const id = `screenshot_${Date.now()}`;

    const screenshot: Screenshot = {
      id,
      url,
      imageData: imageBuffer as string,
      profile,
      createdAt: Date.now(),
      title: title || new URL(url).hostname,
    };

    // Store screenshot (without image data in list, full data separately)
    await redis.set(REDIS_KEYS.screenshotData(id), JSON.stringify(screenshot));
    await redis.lpush(
      REDIS_KEYS.screenshots(profile),
      JSON.stringify({ id, url, title: screenshot.title, createdAt: screenshot.createdAt })
    );

    return Response.json({
      success: true,
      screenshot: { id, url, title: screenshot.title, createdAt: screenshot.createdAt },
    });
  } catch (error) {
    console.error("Screenshot error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to capture screenshot" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const profile = searchParams.get("profile") || "erik";

    const redis = getRedis();

    if (id) {
      const data = await redis.get(REDIS_KEYS.screenshotData(id));
      if (!data) {
        return Response.json({ error: "Screenshot not found" }, { status: 404 });
      }
      return Response.json({ screenshot: typeof data === "string" ? JSON.parse(data) : data });
    }

    // List screenshots for profile
    const rawList = await redis.lrange(REDIS_KEYS.screenshots(profile), 0, 49);
    const screenshots = rawList.map((s) => (typeof s === "string" ? JSON.parse(s) : s));

    return Response.json({ screenshots });
  } catch (error) {
    console.error("Screenshot GET error:", error);
    return Response.json({ error: "Failed to load screenshots" }, { status: 500 });
  }
}
