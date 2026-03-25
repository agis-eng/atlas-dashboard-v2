#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const screenshotsDir = join(projectRoot, "public", "screenshots");
const projectsYamlPath = join(projectRoot, "data", "projects.yaml");
const THUM_IO_BASE = "https://image.thum.io/get";

function buildScreenshotUrl(targetUrl) {
  const normalized = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`;
  return `${THUM_IO_BASE}/width/1280/crop/720/noanimate/${normalized}`;
}

async function generateScreenshots(limit = null) {
  console.log("📸 Starting screenshot generation...\n");

  const yamlContent = await readFile(projectsYamlPath, "utf8");
  const data = yaml.load(yamlContent);
  const projects = data.projects || [];

  let projectsWithUrls = projects.filter(
    (p) => !p.archived && (p.liveUrl || p.previewUrl)
  );

  if (limit) {
    projectsWithUrls = projectsWithUrls.slice(0, limit);
    console.log(`📌 Testing with first ${limit} projects\n`);
  }

  console.log(`Found ${projectsWithUrls.length} projects with URLs\n`);
  await mkdir(screenshotsDir, { recursive: true });

  let successCount = 0;
  let errorCount = 0;

  for (const project of projectsWithUrls) {
    const url = project.liveUrl || project.previewUrl;
    const filename = `${project.id}.png`;
    const filepath = join(screenshotsDir, filename);

    try {
      console.log(`📸 Capturing: ${project.name}`);
      console.log(`   URL: ${url}`);

      const response = await fetch(buildScreenshotUrl(url), {
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

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(filepath, buffer);

      console.log(`   ✅ Saved: ${filename}\n`);
      successCount++;
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
      errorCount++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📁 Screenshots saved to: public/screenshots/`);
  console.log("=".repeat(50));
}

const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : null;

generateScreenshots(limit).catch(console.error);
