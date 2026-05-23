#!/usr/bin/env node
/**
 * scripts/batch-upload.mjs
 *
 * Bypass the (currently broken) browser batch flow: upload local photos
 * directly to Vercel Blob, run them through the group + analyze AI
 * pipeline, then create one ListingDraft per product so they appear on
 * the regular /listings page ready to publish.
 *
 * Auth: uses BLOB_READ_WRITE_TOKEN as both the Blob upload token AND a
 * service key for the dashboard's /api/listings* routes (see
 * getServiceOrSessionUser in lib/auth.ts).
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
 *   DASHBOARD_URL=https://atlas-dashboard-v2-git-main-agis-engs-projects.vercel.app \
 *   node scripts/batch-upload.mjs "/path/to/photos/folder"
 */

import { put } from "@vercel/blob";
import exifr from "exifr";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DASHBOARD = (process.env.DASHBOARD_URL || "").replace(/\/+$/, "");
const FOLDER = process.argv[2];

if (!TOKEN) die("BLOB_READ_WRITE_TOKEN env var required");
if (!DASHBOARD) die("DASHBOARD_URL env var required");
if (!FOLDER) die("Usage: node scripts/batch-upload.mjs <folder>");

const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const LISTED_SUBFOLDER = "Listed";

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

async function listPhotos(dir) {
  const entries = await fs.readdir(dir);
  const out = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    // Skip the Listed/ subfolder — it's where we move photos once a
    // listing succeeds, so a re-run won't reprocess old items.
    if (name === LISTED_SUBFOLDER) continue;
    const ext = path.extname(name).toLowerCase();
    if (!ALLOWED.has(ext)) {
      const full = path.join(dir, name);
      const stat = await fs.stat(full).catch(() => null);
      if (stat?.isDirectory()) continue; // ignore other subdirs silently
      console.warn(`  skip (unsupported ext): ${name}`);
      continue;
    }
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    out.push({ name, fullPath: full, size: stat.size, ext });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function slugify(s) {
  return String(s || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "untitled";
}

async function movePhotosToListed(sourceDir, photoNames, listingTitle) {
  if (!photoNames.length) return { moved: 0, dest: null };
  const dateStr = new Date().toISOString().slice(0, 10);
  const folder = `${slugify(listingTitle)}-${dateStr}`;
  const dest = path.join(sourceDir, LISTED_SUBFOLDER, folder);
  await fs.mkdir(dest, { recursive: true });
  let moved = 0;
  for (const name of photoNames) {
    const from = path.join(sourceDir, name);
    const to = path.join(dest, name);
    try {
      await fs.rename(from, to);
      moved++;
    } catch (err) {
      console.warn(`     could not move ${name}: ${err.message}`);
    }
  }
  return { moved, dest };
}

async function uploadOne(batchId, idx, photo) {
  const buf = await fs.readFile(photo.fullPath);
  let exifTimestampMs = null;
  try {
    const exif = await exifr.parse(buf, ["DateTimeOriginal"]);
    if (exif?.DateTimeOriginal instanceof Date) {
      exifTimestampMs = exif.DateTimeOriginal.getTime();
    }
  } catch {}
  const ext = photo.ext === ".jpeg" ? ".jpg" : photo.ext;
  const blobPath = `listings/batch/${batchId}/${idx}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const contentType =
    ext === ".jpg" ? "image/jpeg" :
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" : "application/octet-stream";
  const blob = await put(blobPath, buf, {
    access: "public",
    contentType,
    token: TOKEN,
    addRandomSuffix: true,
  });
  return {
    photoId: crypto.randomUUID(),
    blobUrl: blob.url,
    exifTimestampMs,
    sizeBytes: photo.size,
    originalName: photo.name,
    // Keep the local file path so we can move it to Listed/ after publish.
    localPath: photo.fullPath,
    localName: photo.name,
  };
}

async function callDashboard(pathname, body) {
  const res = await fetch(`${DASHBOARD}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": TOKEN,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(`${pathname} -> HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

(async function main() {
  const batchId = crypto.randomUUID();
  console.log(`Batch ${batchId}\nFolder: ${FOLDER}\nDashboard: ${DASHBOARD}\n`);

  console.log("1. Scanning folder...");
  const photos = await listPhotos(FOLDER);
  if (photos.length === 0) die("No supported photos found in folder");
  console.log(`   Found ${photos.length} photos (${(photos.reduce((s, p) => s + p.size, 0) / 1024 / 1024).toFixed(1)} MB total)`);

  console.log("\n2. Uploading to Vercel Blob...");
  const uploaded = [];
  for (let i = 0; i < photos.length; i++) {
    const t0 = Date.now();
    try {
      const result = await uploadOne(batchId, i + 1, photos[i]);
      uploaded.push(result);
      console.log(`   [${i + 1}/${photos.length}] ${photos[i].name} -> ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`   [${i + 1}/${photos.length}] ${photos[i].name} FAILED: ${err.message}`);
    }
  }
  if (uploaded.length === 0) die("All uploads failed");

  console.log(`\n3. Grouping ${uploaded.length} photos by timestamp + vision...`);
  const { groups } = await callDashboard("/api/listings/batch/group", {
    batchId,
    photos: uploaded.map(p => ({
      photoId: p.photoId,
      blobUrl: p.blobUrl,
      exifTimestampMs: p.exifTimestampMs,
    })),
  });
  console.log(`   Produced ${groups.length} product groups`);

  console.log(`\n4. Analyzing ${groups.length} products (title, price, shippability)...`);
  // Analyze in chunks of 10 to avoid serverless 300s timeout on large batches.
  const ANALYZE_CHUNK = 10;
  const drafts = [];
  for (let i = 0; i < groups.length; i += ANALYZE_CHUNK) {
    const chunk = groups.slice(i, i + ANALYZE_CHUNK);
    const end = Math.min(i + ANALYZE_CHUNK, groups.length);
    process.stdout.write(`   analyzing ${i + 1}–${end} of ${groups.length}...`);
    const result = await callDashboard("/api/listings/batch/analyze", { groups: chunk });
    drafts.push(...(result.drafts || []));
    process.stdout.write(` ${result.drafts?.length ?? 0} drafts\n`);
  }
  console.log(`   Got ${drafts.length} analyzed drafts total`);

  console.log(`\n5. Creating per-item ListingDraft records...`);
  const now = new Date().toISOString();
  let created = 0;
  // Track which local source files belong to which created listing so we
  // can move them to Listed/<slug-date>/ after the listing is saved.
  // Map blobUrl -> { localPath, localName } from the uploaded set:
  const byBlobUrl = new Map(uploaded.map(u => [u.blobUrl, { localPath: u.localPath, localName: u.localName }]));

  for (const d of drafts) {
    const platforms = ["ebay", "mercari", "facebook"].filter(p => d.platforms?.[p]);
    // Omit `id` — POST /api/listings treats body.id as "update existing"
    // and 404s if the listing doesn't already exist. Without it the route
    // generates a fresh listing id and inserts the new record.
    const record = {
      photos: d.blobUrls,
      title: d.title || "Untitled",
      description: d.description || "",
      price: d.price || null,
      quantity: d.quantity || 1,
      // User rule: default condition to "new" — only flip to used if the
      // user explicitly says so for a specific item in the dashboard later.
      condition: "NEW",
      category: d.category || "",
      brand: d.brand || undefined,
      platforms,
      status: d.status === "needs_review" ? "draft" : "ready",
      weightOz: Math.round((d.weight_lbs || 1) * 16),
      lengthIn: d.dims_in?.length,
      widthIn: d.dims_in?.width,
      heightIn: d.dims_in?.height,
      facebookLocalOnly: !!d.facebookLocalOnly,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await callDashboard("/api/listings", record);
      created++;
      console.log(`   [${created}/${drafts.length}] ${record.title} ($${record.price ?? "?"}, ${platforms.join("+")})`);

      // Move this product's source photos to Listed/<slug>-<date>/.
      const photoLocalNames = (d.blobUrls || [])
        .map(url => byBlobUrl.get(url)?.localName)
        .filter(Boolean);
      if (photoLocalNames.length > 0) {
        const { moved, dest } = await movePhotosToListed(FOLDER, photoLocalNames, record.title);
        if (moved > 0) {
          const relDest = dest ? path.relative(FOLDER, dest) : "";
          console.log(`         moved ${moved} photo(s) -> ${relDest}/`);
        }
      }
    } catch (err) {
      console.error(`   FAILED to create '${record.title}': ${err.message}`);
    }
  }

  console.log(`\n✅ Done. Created ${created} of ${drafts.length} listings.`);
  console.log(`   Source photos moved to ${path.join(FOLDER, LISTED_SUBFOLDER)}/`);
  console.log(`   Open: ${DASHBOARD}/listings`);
})().catch(err => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
