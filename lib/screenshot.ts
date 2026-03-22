import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Capture a screenshot for a project URL
 * Returns true if successful, false otherwise
 */
export async function captureProjectScreenshot(
  projectId: string,
  url: string
): Promise<boolean> {
  try {
    // Dynamic import to avoid bundling puppeteer on client
    const puppeteer = await import("puppeteer");
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    
    const screenshotBuffer = await page.screenshot({ type: "png" });
    await browser.close();

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
