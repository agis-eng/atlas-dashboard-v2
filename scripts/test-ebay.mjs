#!/usr/bin/env node
// E2E test of the eBay listing flow on a single listing, mirroring the dashboard:
// refresh token -> create inventory item -> category lookup -> create offer -> publish.
//
// Usage: node --env-file=.env.local scripts/test-ebay.mjs [listingId]

import { Redis } from "@upstash/redis";

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const BASE = "https://api.ebay.com";
const EBAY_CONDITION_MAP = { "New": "NEW", "Like New": "USED_EXCELLENT", "Good": "USED_GOOD", "Fair": "USED_ACCEPTABLE", "Poor": "USED_ACCEPTABLE" };

// ---- Aspect resolution: fill eBay's required item specifics from listing + title ----
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
// Parse a size from the title/description: "Size 12", "Sz 10.5", "Size S/M/L/XL"
function extractSize(text) {
  const numeric = text.match(/\b(?:size|sz)\s*[:.]?\s*(\d{1,2}(?:\.5)?)\b/i)
    || text.match(/\b(\d{1,2}(?:\.5)?)\s*(?:us|m\b|d\b)\b/i);
  if (numeric) return numeric[1];
  const letter = text.match(/\b(?:size|sz)\s*[:.]?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|small|medium|large)\b/i);
  if (letter) return letter[1].toUpperCase();
  return null;
}

// Pick a value for one required aspect. Prefers listing data, then title
// extraction, then the first eBay-allowed value, then a safe default.
function resolveAspect(aspectMeta, listing) {
  const name = aspectMeta.localizedAspectName;
  const nameLc = name.toLowerCase();
  const text = `${listing.title} ${listing.description || ""} ${listing.category || ""}`;
  // eBay's allowed values for SELECTION_ONLY aspects
  const allowed = (aspectMeta.aspectValues || []).map(v => v.localizedValue);
  const mode = aspectMeta.aspectConstraint?.aspectMode; // FREE_TEXT or SELECTION_ONLY

  const matchAllowed = (val) => {
    if (!allowed.length) return val;
    const v = String(val).toLowerCase().trim();
    const exact = allowed.find(a => a.toLowerCase().trim() === v);
    if (exact) return exact;
    // Word-boundary containment (e.g. "US 12" contains "12"), avoids "12"->"2"
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s)${esc}(\\s|$)`, "i");
    const contains = allowed.find(a => re.test(a));
    return contains || null;
  };

  let val = null;
  if (/brand/.test(nameLc)) val = listing.brand && !/no brand|not sure|unbranded/i.test(listing.brand) ? listing.brand : "Unbranded";
  else if (/shoe size|us shoe size/.test(nameLc)) val = listing.size || extractSize(text) || null;
  else if (/^size/.test(nameLc) || /size type/.test(nameLc)) val = nameLc.includes("type") ? (listing.sizeType || "Regular") : (listing.size || extractSize(text) || null);
  else if (/department/.test(nameLc)) val = detectDepartment(text);
  else if (/color/.test(nameLc)) val = extractColor(text);
  else if (/material/.test(nameLc)) val = extractMaterial(text) || null;
  else if (/type/.test(nameLc)) val = null; // fall to first-allowed
  else if (/style/.test(nameLc)) val = null;

  // Normalize against allowed values when the aspect is selection-only
  if (val != null) {
    const m = matchAllowed(val);
    if (m) return [String(m)];
    if (mode === "FREE_TEXT") return [String(val)];
    // selection-only but our value isn't allowed → fall through to first allowed
  }
  // Fallbacks: first allowed value, then "Unbranded"/safe default for free text
  if (allowed.length) return [allowed[0]];
  if (mode === "FREE_TEXT" || !allowed.length) {
    if (/brand/.test(nameLc)) return ["Unbranded"];
    if (/color/.test(nameLc)) return [extractColor(text)];
    if (/department/.test(nameLc)) return [detectDepartment(text)];
    if (/size/.test(nameLc)) return [String(listing.size || "One Size")];
    return ["Does Not Apply"];
  }
  return ["Does Not Apply"];
}

function buildAspects(listing, requiredAspects) {
  const out = {};
  // Always include Brand
  out.Brand = [listing.brand && !/no brand|not sure|unbranded/i.test(listing.brand) ? listing.brand : "Unbranded"];
  for (const a of requiredAspects) {
    const v = resolveAspect(a, listing);
    if (v && v[0]) out[a.localizedAspectName] = v;
  }
  return out;
}

async function getToken() {
  const raw = await redis.get("ebay:oauth:token");
  const d = typeof raw === "string" ? JSON.parse(raw) : raw;
  return d.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": "en-US",
    "Content-Language": "en-US",
  };
}

async function main() {
  const token = await getToken();
  const policies = await redis.get("ebay:policies").then(p => typeof p === "string" ? JSON.parse(p) : p);
  const listingsRaw = await redis.get("listings:all");
  const listings = Array.isArray(listingsRaw) ? listingsRaw : JSON.parse(listingsRaw || "[]");

  const id = process.argv[2];
  const listing = id
    ? listings.find(l => l.id === id)
    : listings.find(l => l.status === "ready" && l.photos?.length >= 1 && l.title && !l.ebayListingId);

  if (!listing) { console.log("No listing found"); return; }
  console.log(`Testing: ${listing.title}`);
  console.log(`Category hint: ${listing.category} | Price: $${listing.price} | Condition: ${listing.condition}`);

  const sku = `LISTING-${listing.id.slice(0, 8)}`;
  const imageUrls = listing.photos.map(p => p.startsWith("http") ? p : `https://atlas-dashboard-v2.vercel.app${p}`);

  // 1. Category lookup via eBay taxonomy API
  let categoryId = "";
  let requiredAspects = [];
  try {
    const treeRes = await fetch(`${BASE}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US`, { headers: headers(token) });
    const tree = await treeRes.json();
    const treeId = tree.categoryTreeId;
    const sugRes = await fetch(`${BASE}/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(listing.title)}`, { headers: headers(token) });
    const sug = await sugRes.json();
    categoryId = sug.categorySuggestions?.[0]?.category?.categoryId || "";
    const catName = sug.categorySuggestions?.[0]?.category?.categoryName || "";
    console.log(`\n[1] Category: ${categoryId} (${catName})`);

    if (categoryId) {
      const aspRes = await fetch(`${BASE}/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`, { headers: headers(token) });
      const asp = await aspRes.json();
      requiredAspects = (asp.aspects || []).filter(a => a.aspectConstraint?.aspectRequired);
      console.log(`    Required aspects: ${JSON.stringify(requiredAspects.map(a => a.localizedAspectName))}`);
    }
  } catch (e) { console.log(`[1] Category lookup error: ${e.message}`); }

  // 2. Create inventory item — fill ALL required aspects from listing + title
  const aspects = buildAspects(listing, requiredAspects);
  console.log(`[2] Aspects: ${JSON.stringify(aspects)}`);
  const invBody = {
    product: { title: listing.title.slice(0, 80), description: listing.description || listing.title, imageUrls, aspects },
    condition: EBAY_CONDITION_MAP[listing.condition] || "USED_GOOD",
    availability: { shipToLocationAvailability: { quantity: listing.quantity || 1 } },
  };
  const invRes = await fetch(`${BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT", headers: headers(token), body: JSON.stringify(invBody),
  });
  console.log(`\n[2] Inventory item: ${invRes.status === 204 ? "OK" : invRes.status}`);
  if (invRes.status !== 204) console.log("    ", JSON.stringify(await invRes.json()).slice(0, 300));

  // 3. Create offer (or reuse + update an existing one for this SKU)
  const offerBody = {
    sku, marketplaceId: "EBAY_US", format: "FIXED_PRICE",
    listingDescription: listing.description || listing.title,
    pricingSummary: { price: { value: String(listing.price), currency: "USD" } },
    availableQuantity: listing.quantity || 1,
    listingPolicies: { fulfillmentPolicyId: policies.fulfillmentPolicyId, returnPolicyId: policies.returnPolicyId, paymentPolicyId: policies.paymentPolicyId },
    categoryId, merchantLocationKey: "default",
  };
  let offerId = "";
  const offerRes = await fetch(`${BASE}/sell/inventory/v1/offer`, {
    method: "POST", headers: headers(token), body: JSON.stringify(offerBody),
  });
  const offerData = await offerRes.json();
  console.log(`\n[3] Create offer: ${offerRes.status}`);
  if (offerRes.status >= 400) {
    const isDup = offerData.errors?.some(e => /already exists/i.test(e.message || ""));
    if (isDup) {
      // Fetch existing offer by SKU and update it with current data
      const getRes = await fetch(`${BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers: headers(token) });
      const getData = await getRes.json();
      offerId = getData.offers?.[0]?.offerId || offerData.errors[0].parameters?.find(p => p.name === "offerId")?.value || "";
      console.log(`    reusing existing offerId: ${offerId}`);
      const updRes = await fetch(`${BASE}/sell/inventory/v1/offer/${offerId}`, {
        method: "PUT", headers: headers(token), body: JSON.stringify(offerBody),
      });
      console.log(`    update offer: ${updRes.status === 204 ? "OK" : updRes.status}`);
      if (updRes.status >= 400) console.log("    ", JSON.stringify(await updRes.json()).slice(0, 300));
    } else {
      console.log("    ", JSON.stringify(offerData).slice(0, 400)); return;
    }
  } else {
    offerId = offerData.offerId;
    console.log(`    offerId: ${offerId}`);
  }

  // 4. Publish offer
  const pubRes = await fetch(`${BASE}/sell/inventory/v1/offer/${offerId}/publish`, {
    method: "POST", headers: headers(token),
  });
  const pubData = await pubRes.json().catch(() => ({}));
  console.log(`\n[4] Publish offer: ${pubRes.status}`);
  if (pubRes.status >= 400) {
    console.log("    ERRORS:", JSON.stringify(pubData).slice(0, 600));
  } else {
    console.log(`    LISTED! listingId: ${pubData.listingId}`);
    console.log(`    URL: https://www.ebay.com/itm/${pubData.listingId}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
