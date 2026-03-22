#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const screenshotsDir = join(projectRoot, "public", "screenshots");
const projectsYamlPath = join(projectRoot, "data", "projects.yaml");

async function generateScreenshots(limit = null) {
  console.log("📸 Starting screenshot generation...\n");

  // Read projects
  const yamlContent = await readFile(projectsYamlPath, "utf8");
  const data = yaml.load(yamlContent);
  const projects = data.projects || [];

  // Filter projects with URLs
  let projectsWithUrls = projects.filter(
    (p) => !p.archived && (p.liveUrl || p.previewUrl)
  );

  if (limit) {
    projectsWithUrls = projectsWithUrls.slice(0, limit);
    console.log(`📌 Testing with first ${limit} projects\n`);
  }

  console.log(`Found ${projectsWithUrls.length} projects with URLs\n`);

  // Create screenshots directory
  await mkdir(screenshotsDir, { recursive: true });

  // Launch browser
  console.log("🌐 Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let successCount = 0;
  let errorCount = 0;

  for (const project of projectsWithUrls) {
    const url = project.liveUrl || project.previewUrl;
    const filename = `${project.id}.png`;
    const filepath = join(screenshotsDir, filename);

    try {
      console.log(`📸 Capturing: ${project.name}`);
      console.log(`   URL: ${url}`);

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      
      // Navigate with timeout
      await page.goto(url, { 
        waitUntil: "networkidle2", 
        timeout: 30000 
      });

      // Take screenshot
      await page.screenshot({ path: filepath });
      await page.close();

      console.log(`   ✅ Saved: ${filename}\n`);
      successCount++;
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
      errorCount++;
    }
  }

  await browser.close();

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📁 Screenshots saved to: public/screenshots/`);
  console.log("=".repeat(50));
}

// Parse command line args
const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : null;

generateScreenshots(limit).catch(console.error);
