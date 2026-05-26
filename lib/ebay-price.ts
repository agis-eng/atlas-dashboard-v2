export interface GooglePriceResult {
  avgRetailPrice: number | null;
  avgResalePrice: number | null;
  sources: string;
}

export async function getGooglePriceSuggestion(title: string): Promise<GooglePriceResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { avgRetailPrice: null, avgResalePrice: null, sources: "" };

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Search Google for current prices of: "${title.slice(0, 100)}"

Find the typical new/retail price and used/resale price. Reply with ONLY this JSON object, nothing else:
{"retail":RETAIL_PRICE_OR_NULL,"resale":RESALE_PRICE_OR_NULL,"sources":"SITE_NAMES"}

Replace the placeholders with numbers (e.g. 29.99) or null. No markdown, no explanation.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });

    const raw = response.text ?? "";
    console.log("[google-price] raw response:", raw.slice(0, 300));

    // Extract JSON from anywhere in the response (grounding adds citation text around it)
    const jsonMatch = raw.match(/\{[^{}]*"retail"[^{}]*\}/s) ?? raw.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const toNum = (v: unknown) => typeof v === "number" && v > 0 ? Math.round(v * 100) / 100 : null;
      return {
        avgRetailPrice: toNum(parsed.retail),
        avgResalePrice: toNum(parsed.resale),
        sources: typeof parsed.sources === "string" ? parsed.sources.slice(0, 120) : "",
      };
    }

    // Fallback: extract dollar amounts near retail/resale context words
    const findPrice = (contextWords: string[]) => {
      for (const kw of contextWords) {
        const fwd = new RegExp(`${kw}[^.\\n]{0,150}\\$(\\d[\\d,]*(?:\\.\\d{1,2})?)`, "gi");
        const bwd = new RegExp(`\\$(\\d[\\d,]*(?:\\.\\d{1,2})?)[^.\\n]{0,150}${kw}`, "gi");
        for (const re of [fwd, bwd]) {
          const m = re.exec(raw);
          if (m) {
            const n = parseFloat((m[1] ?? m[2] ?? "0").replace(/,/g, ""));
            if (n > 0) return Math.round(n * 100) / 100;
          }
        }
      }
      return null;
    };

    return {
      avgRetailPrice: findPrice(["retail", "new", "amazon", "walmart", "msrp", "original"]),
      avgResalePrice: findPrice(["resale", "used", "secondhand", "marketplace", "offerup", "craigslist"]),
      sources: "",
    };
  } catch (e: any) {
    console.error("[google-price] error:", e?.message);
    return { avgRetailPrice: null, avgResalePrice: null, sources: "" };
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
