import { getRedis, REDIS_KEYS } from "@/lib/redis";

const CACHE_TTL = 60 * 60 * 24; // 24 hours

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

    // Capture screenshot
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

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
