#!/usr/bin/env node
/**
 * scripts/renew-all-facebook.mjs
 *
 * Scrape Facebook's selling dashboard, then for every ACTIVE listing
 * call the Mac server's /facebook/renew-by-title endpoint to refresh
 * its visibility (edit + save without changes). Runs entirely from
 * titles — no Redis lookups, no stored URLs required.
 *
 * Usage:
 *   MERCARI_SERVER_SECRET=... node scripts/renew-all-facebook.mjs
 *
 * (Reads MERCARI_SERVER_SECRET from atlas-dashboard-v2/.env.local if env
 * var isn't set.)
 */

import fs from "node:fs";

const ENV_FILE = "/Users/eriklaine/.openclaw/workspace/atlas-dashboard-v2/.env.local";
function envFromFile(key) {
  if (!fs.existsSync(ENV_FILE)) return "";
  const line = fs.readFileSync(ENV_FILE, "utf8")
    .split("\n").find(l => l.startsWith(`${key}=`));
  if (!line) return "";
  return line.slice(key.length + 1).replace(/^"(.*)"$/, "$1").trim();
}

const SECRET = process.env.MERCARI_SERVER_SECRET || envFromFile("MERCARI_SERVER_SECRET");
const UPSTASH_URL = envFromFile("UPSTASH_REDIS_REST_URL");
const UPSTASH_TOK = envFromFile("UPSTASH_REDIS_REST_TOKEN");
const ARG_DRY_RUN = process.argv.includes("--dry-run");

if (!UPSTASH_URL || !UPSTASH_TOK) {
  console.error("Need UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in env or .env.local");
  process.exit(1);
}

async function getMacServerUrl() {
  const res = await fetch(`${UPSTASH_URL}/get/mercari:server:url`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOK}` },
  });
  const data = await res.json();
  return data.result;
}

async function callMacServer(macUrl, pathname, body) {
  const res = await fetch(`${macUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SECRET ? { "X-Mercari-Secret": SECRET } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text.slice(0, 500) }; }
  if (!res.ok) {
    const err = new Error(`${pathname} -> HTTP ${res.status}: ${data.error || text.slice(0, 200)}`);
    err.data = data;
    throw err;
  }
  return data;
}

(async function main() {
  const macUrl = await getMacServerUrl();
  if (!macUrl) {
    console.error("Mac server URL not in Redis. Is the mercari-tunnel launchd agent running?");
    process.exit(2);
  }
  console.log(`Mac server: ${macUrl}\n`);

  console.log("1. Scrape selling dashboard...");
  const scrape = await callMacServer(macUrl, "/facebook/scrape-listings", {});
  const all = scrape.listings || [];
  const active = all.filter((l) => l.status === "active" || l.status === "unknown");
  console.log(`   Found ${all.length} listings; ${active.length} active/unknown\n`);

  if (active.length === 0) {
    console.log("Nothing to renew. Done.");
    return;
  }

  console.log(`2. Renew ${active.length} listing(s) one at a time${ARG_DRY_RUN ? " (DRY RUN — no actual edits)" : ""}...\n`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < active.length; i++) {
    const l = active[i];
    const tag = `[${i + 1}/${active.length}]`;
    if (ARG_DRY_RUN) {
      console.log(`${tag} would renew: "${l.title.slice(0, 60)}" ($${l.price}, ${l.clicks} clicks)`);
      continue;
    }
    try {
      const t0 = Date.now();
      const result = await callMacServer(macUrl, "/facebook/renew-by-title", {
        title: l.title,
        expectedPrice: l.price,
      });
      console.log(`${tag} ✓ renewed: "${l.title.slice(0, 50)}" in ${((Date.now() - t0) / 1000).toFixed(1)}s (saved via ${result.savedVia})`);
      ok++;
      // Pace requests so we don't trip FB's rate limiter
      await new Promise(r => setTimeout(r, 4000));
    } catch (err) {
      console.error(`${tag} ✗ FAILED: "${l.title.slice(0, 50)}" — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Done. Renewed ${ok}/${active.length} (${failed} failed).`);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
