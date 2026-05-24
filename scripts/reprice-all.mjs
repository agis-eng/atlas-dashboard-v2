#!/usr/bin/env node
// Reprices all draft/ready listings using eBay sold prices (Finding API).
// Falls back to active listing prices if <3 sold results found.
//
// Usage (loads credentials from .env.local automatically):
//   node --env-file=.env.local scripts/reprice-all.mjs

import { Redis } from "@upstash/redis";

const EBAY_APP_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!EBAY_APP_ID || !EBAY_CLIENT_SECRET) {
  console.error("ERROR: EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set. Run with --env-file=.env.local");
  process.exit(1);
}
if (!REDIS_URL || !REDIS_TOKEN) {
  console.error("ERROR: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. Run with --env-file=.env.local");
  process.exit(1);
}

const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function cleanTitle(title) {
  return title
    .replace(/\b(new with tags?|nwt|new in box|nib|new in package|nip)\b/gi, "")
    .replace(/\s+/g, " ").trim().slice(0, 80);
}

async function getSoldPrices(keywords) {
  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.0.0",
    "SECURITY-APPNAME": EBAY_APP_ID,
    "RESPONSE-DATA-FORMAT": "JSON",
    "keywords": keywords,
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "itemFilter(1).name": "ListingType",
    "itemFilter(1).value": "FixedPrice",
    "paginationInput.entriesPerPage": "25",
    "sortOrder": "EndTimeSoonest",
  });
  const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
  return items
    .map(i => parseFloat(i?.sellingStatus?.[0]?.currentPrice?.[0]?.["__value__"] ?? ""))
    .filter(p => !isNaN(p) && p > 0);
}

async function getListedPrices(keywords) {
  const creds = Buffer.from(`${EBAY_APP_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return [];
  const params = new URLSearchParams({ q: keywords, limit: "25", filter: "buyingOptions:{FIXED_PRICE}" });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.itemSummaries ?? [])
    .map(i => parseFloat(i?.price?.value)).filter(p => !isNaN(p) && p > 0);
}

async function researchPrice(title) {
  const keywords = cleanTitle(title);
  if (!keywords) return null;

  const sold = await getSoldPrices(keywords);
  if (sold.length >= 3) {
    const med = median(sold);
    return { price: Math.round(med * 0.95), source: "sold", med, n: sold.length };
  }

  const listed = await getListedPrices(keywords);
  if (listed.length >= 3) {
    const med = median(listed);
    return { price: Math.round(med * 0.80), source: "listed", med, n: listed.length };
  }

  return null;
}

async function main() {
  const raw = await redis.get("listings:all");
  let listings = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : []);

  const targets = listings.filter(l =>
    (l.status === "draft" || l.status === "ready") && l.title && l.title !== "Untitled" && l.title !== "New listing"
  );

  console.log(`Repricing ${targets.length} listings...\n`);

  let updated = 0, skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const listing = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${listing.title.slice(0, 50)}... `);

    try {
      const result = await researchPrice(listing.title);
      if (result) {
        const old = listing.price ?? "?";
        listings = listings.map(l =>
          l.id === listing.id
            ? { ...l, price: result.price, updatedAt: new Date().toISOString() }
            : l
        );
        console.log(`$${old} → $${result.price} (${result.source}: median $${result.med.toFixed(2)}, n=${result.n})`);
        updated++;
      } else {
        console.log(`no data`);
        skipped++;
      }
    } catch (err) {
      console.log(`error: ${err.message}`);
      skipped++;
    }

    // Save to Redis every 10 to survive interruptions
    if ((i + 1) % 10 === 0) {
      await redis.set("listings:all", JSON.stringify(listings));
      console.log("  → saved to Redis");
    }

    if (i < targets.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  await redis.set("listings:all", JSON.stringify(listings));
  console.log(`\nDone. Updated: ${updated}, No data: ${skipped}`);
}

main().catch(console.error);
