function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
}

async function getEbayAppToken(): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set");
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get eBay token");
  return data.access_token;
}

export async function getEbayPriceSuggestion(title: string): Promise<EbayPriceResult> {
  const keywords = cleanTitleForSearch(title);
  if (!keywords) return { suggestedPrice: null, medianListPrice: null, sampleSize: 0, message: "No title" };

  try {
    const token = await getEbayAppToken();
    const params = new URLSearchParams({ q: keywords, limit: "25", filter: "buyingOptions:{FIXED_PRICE}" });
    const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return { suggestedPrice: null, medianListPrice: null, sampleSize: 0, message: `eBay error ${res.status}` };

    const data = await res.json();
    const prices: number[] = (data.itemSummaries || [])
      .map((item: any) => parseFloat(item?.price?.value))
      .filter((p: number) => !isNaN(p) && p > 0);

    if (prices.length === 0) return { suggestedPrice: null, medianListPrice: null, sampleSize: 0, message: "No listings found" };

    const med = median(prices);
    const suggested = Math.round(med * 0.90);

    return {
      suggestedPrice: suggested,
      medianListPrice: Math.round(med * 100) / 100,
      sampleSize: prices.length,
      message: `Based on ${prices.length} active eBay listings. Median $${med.toFixed(2)} → suggested $${suggested} (10% under).`,
    };
  } catch (e: any) {
    return { suggestedPrice: null, medianListPrice: null, sampleSize: 0, message: e.message };
  }
}
