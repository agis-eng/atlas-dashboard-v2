import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const THUM_IO_BASE = "https://image.thum.io/get";

function buildScreenshotUrl(targetUrl: string): string {
  const normalized = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`;
  return `${THUM_IO_BASE}/width/1280/crop/720/noanimate/${normalized}`;
}

/**
 * Capture a screenshot for a project URL
 * Returns true if successful, false otherwise
 */
export async function captureProjectScreenshot(
  projectId: string,
  url: string
): Promise<boolean> {
  try {
    const screenshotUrl = buildScreenshotUrl(url);
    const response = await fetch(screenshotUrl, {
      headers: {
        "user-agent": "Atlas Dashboard Screenshot Fetcher/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Screenshot provider returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`Unexpected screenshot content type: ${contentType || "unknown"}`);
    }

    const screenshotBuffer = Buffer.from(await response.arrayBuffer());

    // Save to public/screenshots/
    const screenshotsDir = join(process.cwd(), "public", "screenshots");
    await mkdir(screenshotsDir, { recursive: true });

    const filepath = join(screenshotsDir, `${projectId}.png`);
    await writeFile(filepath, screenshotBuffer);

    console.log(`✅ Screenshot captured for ${projectId}: ${url}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to capture screenshot for ${projectId}:`, error);
    return false;
  }
}
