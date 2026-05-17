// app/api/listings/publish/ebay/route.ts
import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

export const maxDuration = 120;

const EBAY_CONDITION_MAP: Record<string, string> = {
  "new": "NEW",
  "like_new": "LIKE_NEW",
  "used_excellent": "USED_EXCELLENT",
  "used_good": "USED_GOOD",
  "used_fair": "USED_FAIR",
  "used_acceptable": "USED_FAIR",
  "USED_GOOD": "USED_GOOD",
  "NEW": "NEW",
};

interface PublishRequest {
  listingId: string;
  env?: "sandbox" | "production";
  token?: string;
  sku: string;
  draft: {
    title: string;
    description: string;
    price: number;
    quantity: number;
    condition: string;
    brand?: string;
    size?: string;
    sizeType?: string;
    photos: string[];
  };
}

async function getTokenFromRedis(): Promise<string> {
  try {
    const redis = getRedis();
    const raw = await redis.get(REDIS_KEYS.ebayToken);
    if (!raw) return "";
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return "";
    return data.access_token || "";
  } catch {
    return "";
  }
}

async function callEbay(baseUrl: string, cookieHeader: string, body: any): Promise<any> {
  const res = await fetch(`${baseUrl}/api/ebay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.errors?.[0]?.message || data.error || `eBay step failed (${res.status})`);
  }
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as PublishRequest;
    const env = body.env || "production";
    const token = body.token || (await getTokenFromRedis()) || process.env.EBAY_USER_TOKEN || "";
    if (!token) {
      return Response.json({ ok: false, error: "No eBay token; reconnect eBay" }, { status: 400 });
    }

    const baseUrl = new URL(request.url).origin;
    const cookieHeader = request.headers.get("cookie") || "";
    const { sku, draft } = body;
    const condition = EBAY_CONDITION_MAP[draft.condition?.toLowerCase()] || EBAY_CONDITION_MAP[draft.condition] || "USED_GOOD";
    const quantity = draft.quantity || 1;

    // 1. Create inventory item
    await callEbay(baseUrl, cookieHeader, {
      action: "create-inventory-item",
      token,
      env,
      sku,
      product: {
        title: draft.title,
        description: draft.description,
        imageUrls: draft.photos,
        aspects: {
          Brand: [draft.brand || "Unbranded"],
          "Size Type": [draft.sizeType || "Regular"],
          ...(draft.size ? { Size: [draft.size] } : {}),
        },
      },
      condition,
      availability: { shipToLocationAvailability: { quantity } },
    });

    // 2. Categories (best-effort)
    let categoryId = "";
    try {
      const catRes = await fetch(
        `${baseUrl}/api/ebay?action=categories&q=${encodeURIComponent(draft.title)}&env=${env}`,
        { headers: { Cookie: cookieHeader } }
      );
      if (catRes.ok) {
        const catData = await catRes.json();
        categoryId = catData.categorySuggestions?.[0]?.category?.categoryId || "";
      }
    } catch {}

    // 3. Policies
    let policies = { fulfillmentPolicyId: "", returnPolicyId: "", paymentPolicyId: "" };
    try {
      const polRes = await fetch(`${baseUrl}/api/ebay/policies`, { headers: { Cookie: cookieHeader } });
      if (polRes.ok) {
        const polData = await polRes.json();
        if (polData.policies) policies = polData.policies;
      }
    } catch {}

    // 4. Create offer
    const offerData = await callEbay(baseUrl, cookieHeader, {
      action: "create-offer",
      token,
      env,
      sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      listingDescription: draft.description,
      pricingSummary: { price: { value: String(draft.price), currency: "USD" } },
      availableQuantity: quantity,
      listingPolicies: policies,
      countryCode: "US",
      merchantLocationKey: "default",
      categoryId,
    });
    const offerId = offerData.offerId;

    // 5. Publish offer
    const pubData = await callEbay(baseUrl, cookieHeader, {
      action: "publish-offer",
      token,
      env,
      offerId,
    });

    return Response.json({
      ok: true,
      listingId: body.listingId,
      offerId,
      ebayListingId: pubData.listingId || null,
    });
  } catch (err) {
    console.error("[publish/ebay] error", err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
