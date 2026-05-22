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

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

async function listPhotos(dir) {
  const entries = await fs.readdir(dir);
  const out = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const ext = path.extname(name).toLowerCase();
    if (!ALLOWED.has(ext)) {
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
  const { drafts } = await callDashboard("/api/listings/batch/analyze", { groups });
  console.log(`   Got ${drafts.length} analyzed drafts`);

  console.log(`\n5. Creating per-item ListingDraft records...`);
  const now = new Date().toISOString();
  let created = 0;
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
      condition: d.condition || "USED_GOOD",
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
    } catch (err) {
      console.error(`   FAILED to create '${record.title}': ${err.message}`);
    }
  }

  console.log(`\n✅ Done. Created ${created} of ${drafts.length} listings.`);
  console.log(`   Open: ${DASHBOARD}/listings`);
})().catch(err => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
