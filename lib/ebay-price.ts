import Anthropic from "@anthropic-ai/sdk";

export interface AiPriceResult {
  avgRetailPrice: number | null;
  avgResalePrice: number | null;
}

export async function getAiPriceEstimate(title: string): Promise<AiPriceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { avgRetailPrice: null, avgResalePrice: null };

  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      // Real web search — the model actually looks up current prices instead of
      // guessing from training knowledge.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as any],
      messages: [{
        role: "user",
        content: `Find the REAL current price for this exact item by searching the web: "${title.slice(0, 140)}"

Search Google Shopping, Amazon, Walmart, Target, and the manufacturer for:
- retail: the typical NEW price right now at major retailers for THIS exact product/model.
- resale: the typical USED price on eBay/Facebook Marketplace (usually 50-70% of retail for good condition).

Match the exact model/size. IGNORE bundles, multi-packs, or accessories that aren't this item.
Be concise. The VERY LAST thing in your reply must be one line of valid JSON and nothing after it: {"retail": <number>, "resale": <number>}`,
      }],
    });

    // Web search produces many text blocks; scan them all for the JSON (use the
    // last match), since the model may narrate before emitting it.
    const allText = (msg.content as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
      .join("\n");
    const matches = [...allText.matchAll(/\{[^{}]*"(?:retail|resale)"[^{}]*\}/g)];
    const text = (matches.length ? matches[matches.length - 1][0] : allText)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const toNum = (v: unknown) => typeof v === "number" && v > 0 ? Math.round(v * 100) / 100 : null;
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fallback: pull "retail"/"resale" numbers straight from the prose.
      const r = allText.match(/retail[^0-9$]{0,20}\$?\s*(\d+(?:\.\d+)?)/i);
      const s = allText.match(/resale[^0-9$]{0,20}\$?\s*(\d+(?:\.\d+)?)/i);
      parsed = { retail: r ? Number(r[1]) : null, resale: s ? Number(s[1]) : null };
    }
    return { avgRetailPrice: toNum(parsed.retail), avgResalePrice: toNum(parsed.resale) };
  } catch {
    return { avgRetailPrice: null, avgResalePrice: null };
  }
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Remove outliers using Tukey fences (Q1 - 1.5*IQR, Q3 + 1.5*IQR)
function removeOutliers(nums: number[]): number[] {
  if (nums.length < 5) return nums;
  const sorted = [...nums].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return sorted.filter((n) => n >= lo && n <= hi);
}

export function cleanTitleForSearch(title: string): string {
  return title
    .replace(/\b(new with tags?|nwt|new in box|nib|new in package|nip)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export interface EbayPriceResult {
  suggestedPrice: number | null;
  medianListPrice: number | null;
  sampleSize: number;
  message: string;
  source?: "sold" | "listed";
}

// eBay Finding API — returns actual sold transaction prices (no OAuth needed, just App ID)
async function getSoldPrices(keywords: string): Promise<number[]> {
  const appId = process.env.EBAY_CLIENT_ID;
  if (!appId) throw new Error("EBAY_CLIENT_ID not set");

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.0.0",
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "keywords": keywords,
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "itemFilter(1).name": "ListingType",
    "itemFilter(1).value": "FixedPrice",
    "paginationInput.entriesPerPage": "25",
    "sortOrder": "EndTimeSoonest",
  });

  const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${params}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Finding API ${res.status}`);

  const data = await res.json();
  const items: any[] = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];

  return items
    .map((item: any) => parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.["__value__"] ?? ""))
    .filter((p: number) => !isNaN(p) && p > 0);
}

// eBay Browse API — active listing prices (fallback)
async function getListedPrices(keywords: string): Promise<number[]> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("eBay credentials not set");

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get eBay token");

  const params = new URLSearchParams({ q: keywords, limit: "25", filter: "buyingOptions:{FIXED_PRICE}" });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!res.ok) throw new Error(`Browse API ${res.status}`);

  const data = await res.json();
  return (data.itemSummaries ?? [])
    .map((item: any) => parseFloat(item?.price?.value))
    .filter((p: number) => !isNaN(p) && p > 0);
}

export async function getEbayPriceSuggestion(title: string): Promise<EbayPriceResult> {
  const keywords = cleanTitleForSearch(title);
  if (!keywords) return { suggestedPrice: null, medianListPrice: null, sampleSize: 0, message: "No title" };

  // Try sold prices first
  try {
    const rawPrices = await getSoldPrices(keywords);
    const soldPrices = removeOutliers(rawPrices);
    if (soldPrices.length >= 3) {
      const med = median(soldPrices);
      const suggested = Math.round(med * 0.95);
      return {
        suggestedPrice: suggested,
        medianListPrice: Math.round(med * 100) / 100,
        sampleSize: soldPrices.length,
        message: `Based on ${soldPrices.length} eBay sold transactions. Median $${med.toFixed(2)} → suggested $${suggested} (5% under sold median).`,
        source: "sold",
      };
    }
  } catch {
    // Fall through to Browse API
  }

  // Fall back to active listings
  try {
    const rawPrices = await getListedPrices(keywords);
    const listedPrices = removeOutliers(rawPrices);
    if (listedPrices.length === 0) {
      return { suggestedPrice: null, medianListPrice: null, sampleSize: 0, message: "No eBay results found" };
    }
    const med = median(listedPrices);
    const suggested = Math.round(med * 0.80);
    return {
      suggestedPrice: suggested,
      medianListPrice: Math.round(med * 100) / 100,
      sampleSize: listedPrices.length,
      message: `Based on ${listedPrices.length} active eBay listings (no sold data). Median $${med.toFixed(2)} → suggested $${suggested} (20% under listed).`,
      source: "listed",
    };
  } catch (e: any) {
    return { suggestedPrice: null, medianListPrice: null, sampleSize: 0, message: e.message };
  }
}

export interface ResolvedPrice {
  price: number | null;
  source: string;
  ebay: EbayPriceResult;
  ai: AiPriceResult;
  ebayMismatch: boolean;
}

// Single source of truth for choosing a listing price from real market data.
// Priority, best → worst:
//   1. eBay SOLD comps (actual completed transactions — most reliable)
//   2. AI web-search resale estimate (real Google Shopping/Amazon lookup —
//      preferred over eBay *active* listings, which run high and overprice)
//   3. eBay active listings (only when there's no AI resale signal)
//   4. AI retail × 0.7 (≈30% under new, to read as a deal)
// eBay comps that exceed 2× the AI retail estimate are treated as a wrong-product
// match (bundle/multi-pack/different SKU) and skipped.
export async function resolveListingPrice(title: string): Promise<ResolvedPrice> {
  const [ebay, ai] = await Promise.all([
    getEbayPriceSuggestion(title),
    getAiPriceEstimate(title).catch(() => ({ avgRetailPrice: null, avgResalePrice: null })),
  ]);

  const ebayPrice = ebay.suggestedPrice;
  const retail = ai?.avgRetailPrice ?? null;
  const resale = ai?.avgResalePrice ?? null;
  const ebayMismatch =
    ebayPrice !== null && retail !== null && retail > 0 && ebayPrice > retail * 2;

  let price: number | null = null;
  let source = "";
  if (ebay.source === "sold" && ebayPrice !== null && !ebayMismatch) {
    price = ebayPrice;
    source = "ebay-sold";
  } else if (resale !== null && resale > 0) {
    price = Math.round(resale);
    source = "ai-resale-websearch";
  } else if (ebayPrice !== null && !ebayMismatch) {
    price = ebayPrice;
    source = "ebay-active";
  } else if (retail !== null && retail > 0) {
    price = Math.round(retail * 0.7);
    source = "ai-retail-x0.7";
  }

  return { price, source, ebay, ai, ebayMismatch };
}
