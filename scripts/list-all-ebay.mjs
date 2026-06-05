#!/usr/bin/env node
// Bulk-lists all eligible "ready"/"draft" listings to eBay (live), reusing the
// proven flow: category lookup -> required aspects -> inventory item -> offer ->
// publish. Updates Redis with ebayListingId after each success. Auto-refreshes
// the token. Skips listings already on eBay.
//
// Usage: node --env-file=.env.local scripts/list-all-ebay.mjs [--limit N]

import { Redis } from "@upstash/redis";

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const BASE = "https://api.ebay.com";
const EBAY_CONDITION_MAP = { "New": "NEW", "Like New": "USED_EXCELLENT", "Good": "USED_GOOD", "Fair": "USED_ACCEPTABLE", "Poor": "USED_ACCEPTABLE" };
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

function extractColor(text) {
  const colors = ["black","white","gray","grey","blue","red","green","yellow","pink","purple","brown","tan","beige","navy","orange","gold","silver","burgundy","maroon","teal","cream","ivory","multicolor"];
  const t = text.toLowerCase();
  for (const c of colors) if (t.includes(c)) return c.charAt(0).toUpperCase() + c.slice(1);
  return "Multicolor";
}
function extractMaterial(text) {
  const mats = ["canvas","leather","suede","cotton","polyester","nylon","wool","denim","mesh","rubber","synthetic","fleece","silk","linen","plastic","ceramic","metal","wood","glass"];
  const t = text.toLowerCase();
  for (const m of mats) if (t.includes(m)) return m.charAt(0).toUpperCase() + m.slice(1);
  return "";
}
function detectDepartment(text) {
  const t = text.toLowerCase();
  if (/\b(women|woman|womens|women's|ladies)\b/.test(t)) return "Women";
  if (/\b(men|mens|men's)\b/.test(t)) return "Men";
  if (/\bgirl/.test(t)) return "Girls";
  if (/\bboy/.test(t)) return "Boys";
  if (/\b(kid|child|youth|toddler|baby|infant)\b/.test(t)) return "Unisex Kids";
  return "Unisex Adult";
}
function extractSize(text) {
  const numeric = text.match(/\b(?:size|sz)\s*[:.]?\s*(\d{1,2}(?:\.5)?)\b/i)
    || text.match(/\b(\d{1,2}(?:\.5)?)\s*(?:us|m\b|d\b)\b/i);
  if (numeric) return numeric[1];
  const letter = text.match(/\b(?:size|sz)\s*[:.]?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|small|medium|large)\b/i);
  if (letter) return letter[1].toUpperCase();
  return null;
}
function resolveAspect(aspectMeta, listing) {
  const nameLc = aspectMeta.localizedAspectName.toLowerCase();
  const text = `${listing.title} ${listing.description || ""} ${listing.category || ""}`;
  const allowed = (aspectMeta.aspectValues || []).map(v => v.localizedValue);
  const mode = aspectMeta.aspectConstraint?.aspectMode;
  const matchAllowed = (val) => {
    if (!allowed.length) return val;
    const v = String(val).toLowerCase().trim();
    const exact = allowed.find(a => a.toLowerCase().trim() === v);
    if (exact) return exact;
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)${esc}(\\s|$)`, "i");
    return allowed.find(a => re.test(a)) || null;
  };
  let val = null;
  if (/brand/.test(nameLc)) val = listing.brand && !/no brand|not sure|unbranded/i.test(listing.brand) ? listing.brand : "Unbranded";
  else if (/shoe size|us shoe size/.test(nameLc)) val = listing.size || extractSize(text) || null;
  else if (/^size/.test(nameLc) || /size type/.test(nameLc)) val = nameLc.includes("type") ? (listing.sizeType || "Regular") : (listing.size || extractSize(text) || null);
  else if (/department/.test(nameLc)) val = detectDepartment(text);
  else if (/color/.test(nameLc)) val = extractColor(text);
  else if (/material/.test(nameLc)) val = extractMaterial(text) || null;
  if (val != null) {
    const m = matchAllowed(val);
    if (m) return [String(m)];
    if (mode === "FREE_TEXT") return [String(val)];
  }
  if (allowed.length) return [allowed[0]];
  if (/brand/.test(nameLc)) return ["Unbranded"];
  if (/color/.test(nameLc)) return [extractColor(text)];
  if (/department/.test(nameLc)) return [detectDepartment(text)];
  if (/size/.test(nameLc)) return [String(listing.size || "One Size")];
  return ["Does Not Apply"];
}
function buildAspects(listing, requiredAspects) {
  const out = {};
  out.Brand = [listing.brand && !/no brand|not sure|unbranded/i.test(listing.brand) ? listing.brand : "Unbranded"];
  for (const a of requiredAspects) {
    const v = resolveAspect(a, listing);
    if (v && v[0]) out[a.localizedAspectName] = v;
  }
  return out;
}
function headers(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", "Accept-Language": "en-US", "Content-Language": "en-US" };
}

let TOKEN = "";
async function ensureToken() {
  const raw = await redis.get("ebay:oauth:token");
  const d = typeof raw === "string" ? JSON.parse(raw) : raw;
  const expired = d.expires_at && new Date(d.expires_at) < new Date(Date.now() + 5 * 60 * 1000); // refresh 5min early
  if (!expired) { TOKEN = d.access_token; return; }
  const creds = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST", headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: d.refresh_token }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("token refresh failed: " + JSON.stringify(data).slice(0, 200));
  const newData = { access_token: data.access_token, refresh_token: d.refresh_token, expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString() };
  await redis.set("ebay:oauth:token", JSON.stringify(newData));
  TOKEN = data.access_token;
  console.log("  (token refreshed)");
}

let TREE_ID = "0";
async function listOne(listing, policies) {
  const sku = `LISTING-${listing.id.slice(0, 8)}`;
  const imageUrls = listing.photos.map(p => p.startsWith("http") ? p : `https://atlas-dashboard-v2.vercel.app${p}`);

  // Category + required aspects. Try the full title, then fall back to the
  // listing's category leaf, then the first 4 words of the title.
  let categoryId = "", requiredAspects = [];
  const catLeaf = (listing.category || "").split(">").pop()?.trim() || "";
  const shortTitle = listing.title.split(/\s+/).slice(0, 4).join(" ");
  for (const q of [listing.title, catLeaf, shortTitle].filter(Boolean)) {
    const sugRes = await fetch(`${BASE}/commerce/taxonomy/v1/category_tree/${TREE_ID}/get_category_suggestions?q=${encodeURIComponent(q)}`, { headers: headers(TOKEN) });
    const sug = await sugRes.json();
    categoryId = sug.categorySuggestions?.[0]?.category?.categoryId || "";
    if (categoryId) break;
  }
  if (!categoryId) return { ok: false, reason: "no category" };
  const aspRes = await fetch(`${BASE}/commerce/taxonomy/v1/category_tree/${TREE_ID}/get_item_aspects_for_category?category_id=${categoryId}`, { headers: headers(TOKEN) });
  const asp = await aspRes.json();
  requiredAspects = (asp.aspects || []).filter(a => a.aspectConstraint?.aspectRequired);

  const aspects = buildAspects(listing, requiredAspects);
  const invBody = {
    product: { title: listing.title.slice(0, 80), description: listing.description || listing.title, imageUrls, aspects },
    condition: EBAY_CONDITION_MAP[listing.condition] || "USED_GOOD",
    availability: { shipToLocationAvailability: { quantity: listing.quantity || 1 } },
  };
  const invRes = await fetch(`${BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: "PUT", headers: headers(TOKEN), body: JSON.stringify(invBody) });
  if (invRes.status !== 204 && invRes.status !== 200) {
    return { ok: false, reason: "inventory: " + JSON.stringify(await invRes.json()).slice(0, 150) };
  }

  const offerBody = {
    sku, marketplaceId: "EBAY_US", format: "FIXED_PRICE",
    listingDescription: listing.description || listing.title,
    pricingSummary: { price: { value: String(listing.price), currency: "USD" } },
    availableQuantity: listing.quantity || 1,
    listingPolicies: { fulfillmentPolicyId: policies.fulfillmentPolicyId, returnPolicyId: policies.returnPolicyId, paymentPolicyId: policies.paymentPolicyId },
    categoryId, merchantLocationKey: "default",
  };
  let offerId = "";
  const offerRes = await fetch(`${BASE}/sell/inventory/v1/offer`, { method: "POST", headers: headers(TOKEN), body: JSON.stringify(offerBody) });
  const offerData = await offerRes.json();
  if (offerRes.status >= 400) {
    const isDup = offerData.errors?.some(e => /already exists/i.test(e.message || ""));
    if (!isDup) return { ok: false, reason: "offer: " + JSON.stringify(offerData).slice(0, 150) };
    const getRes = await fetch(`${BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers: headers(TOKEN) });
    const getData = await getRes.json();
    offerId = getData.offers?.[0]?.offerId || offerData.errors[0].parameters?.find(p => p.name === "offerId")?.value || "";
    await fetch(`${BASE}/sell/inventory/v1/offer/${offerId}`, { method: "PUT", headers: headers(TOKEN), body: JSON.stringify(offerBody) });
  } else {
    offerId = offerData.offerId;
  }

  const pubRes = await fetch(`${BASE}/sell/inventory/v1/offer/${offerId}/publish`, { method: "POST", headers: headers(TOKEN) });
  const pubData = await pubRes.json().catch(() => ({}));
  if (pubRes.status >= 400) return { ok: false, reason: "publish: " + JSON.stringify(pubData.errors?.[0]?.message || pubData).slice(0, 180), offerId, sku };
  return { ok: true, listingId: pubData.listingId, offerId, sku };
}

async function main() {
  await ensureToken();
  const policies = await redis.get("ebay:policies").then(p => typeof p === "string" ? JSON.parse(p) : p);
  const treeRes = await fetch(`${BASE}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US`, { headers: headers(TOKEN) });
  TREE_ID = (await treeRes.json()).categoryTreeId || "0";

  let listings = await redis.get("listings:all").then(r => Array.isArray(r) ? r : JSON.parse(r || "[]"));
  const eligible = listings.filter(l => (l.status === "ready" || l.status === "draft") && l.photos?.length >= 1 && l.title && l.title !== "Untitled" && !l.ebayListingId).slice(0, LIMIT);
  console.log(`Listing ${eligible.length} items to eBay...\n`);

  let listed = 0, failed = 0;
  const failures = [];
  for (let i = 0; i < eligible.length; i++) {
    const l = eligible[i];
    process.stdout.write(`[${i + 1}/${eligible.length}] ${l.title.slice(0, 45)}... `);
    try {
      await ensureToken();
      const r = await listOne(l, policies);
      if (r.ok) {
        listed++;
        console.log(`LISTED ${r.listingId}`);
        // Update Redis immediately so progress survives interruption
        listings = listings.map(x => x.id === l.id ? { ...x, ebayListingId: r.listingId, ebayOfferId: r.offerId, ebaySku: r.sku, status: (x.facebookListingUrl || x.mercariListingUrl || x.status === "listed") ? x.status : "listed" } : x);
        await redis.set("listings:all", JSON.stringify(listings));
      } else {
        failed++;
        failures.push(`${l.title.slice(0, 40)} — ${r.reason}`);
        console.log(`FAIL: ${r.reason}`);
      }
    } catch (e) {
      failed++;
      failures.push(`${l.title.slice(0, 40)} — ${e.message}`);
      console.log(`ERROR: ${e.message}`);
    }
    await new Promise(res => setTimeout(res, 800));
  }

  console.log(`\n=== DONE: ${listed} listed, ${failed} failed ===`);
  if (failures.length) { console.log("\nFailures:"); failures.forEach(f => console.log("  - " + f)); }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
