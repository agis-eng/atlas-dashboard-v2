import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS } from "@/lib/redis";

const EBAY_TOKEN = process.env.EBAY_USER_TOKEN || "";
const SANDBOX_API = "https://api.sandbox.ebay.com";
const PRODUCTION_API = "https://api.ebay.com";

async function getTokenFromRedis(): Promise<string> {
  try {
    const redis = getRedis();
    const raw = await redis.get(REDIS_KEYS.ebayToken);
    if (!raw) return "";
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const expired = data.expires_at && new Date(data.expires_at) < new Date();
    if (!expired) return data.access_token || "";
    // Token expired — refresh it using the stored refresh_token.
    if (data.refresh_token && process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) {
      const creds = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
      const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST",
        headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: data.refresh_token }).toString(),
      });
      if (res.ok) {
        const refreshed = await res.json();
        if (refreshed.access_token) {
          const newData = {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || data.refresh_token,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          };
          await redis.set(REDIS_KEYS.ebayToken, JSON.stringify(newData));
          return newData.access_token;
        }
      }
    }
    return "";
  } catch {
    return "";
  }
}

function getBaseUrl(env: string) {
  return env === "production" ? PRODUCTION_API : SANDBOX_API;
}

function ebayHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": "en-US",
    "Content-Language": "en-US",
    "Authorization": `Bearer ${token}`,
  };
}

// GET - Proxy eBay API reads (listings, orders, inventory)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const env = searchParams.get("env") || "sandbox";
  let token = searchParams.get("token") || EBAY_TOKEN;
  if (!token) {
    token = await getTokenFromRedis();
  }
  const baseUrl = getBaseUrl(env);

  if (!token) {
    return Response.json({ error: "No eBay token configured" }, { status: 401 });
  }

  try {
    switch (action) {
      case "test-connection": {
        const tokenType = "OAuth Bearer";
        const res = await fetch(
          `${baseUrl}/sell/inventory/v1/inventory_item?limit=1`,
          { headers: ebayHeaders(token) }
        );
        if (res.ok) {
          return Response.json({
            connected: true,
            environment: env,
            tokenType,
          });
        }
        const errText = await res.text().catch(() => "");
        let errBody: any = null;
        try { errBody = JSON.parse(errText); } catch { /* not JSON */ }
        const errorDetail = errBody?.errors?.[0]?.message
          || errBody?.error_description
          || errBody?.error
          || errText
          || res.statusText;
        return Response.json(
          {
            connected: false,
            error: errorDetail,
            tokenType,
            httpStatus: res.status,
            apiResponse: errBody || errText || null,
          },
          { status: res.status }
        );
      }

      case "active-listings": {
        const limit = searchParams.get("limit") || "50";
        const offset = searchParams.get("offset") || "0";
        const res = await fetch(
          `${baseUrl}/sell/inventory/v1/offer?limit=${limit}&offset=${offset}`,
          { headers: ebayHeaders(token) }
        );
        const data = await res.json();
        return Response.json(data, { status: res.status });
      }

      case "inventory": {
        const limit = searchParams.get("limit") || "50";
        const offset = searchParams.get("offset") || "0";
        const res = await fetch(
          `${baseUrl}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`,
          { headers: ebayHeaders(token) }
        );
        const data = await res.json();
        return Response.json(data, { status: res.status });
      }

      case "orders": {
        const limit = searchParams.get("limit") || "20";
        const offset = searchParams.get("offset") || "0";
        const res = await fetch(
          `${baseUrl}/sell/fulfillment/v1/order?limit=${limit}&offset=${offset}`,
          { headers: ebayHeaders(token) }
        );
        const data = await res.json();
        return Response.json(data, { status: res.status });
      }

      case "order-detail": {
        const orderId = searchParams.get("orderId");
        if (!orderId) return Response.json({ error: "Missing orderId" }, { status: 400 });
        const res = await fetch(
          `${baseUrl}/sell/fulfillment/v1/order/${orderId}`,
          { headers: ebayHeaders(token) }
        );
        const data = await res.json();
        return Response.json(data, { status: res.status });
      }

      case "categories": {
        const q = searchParams.get("q") || "";
        const res = await fetch(
          `${baseUrl}/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(q)}`,
          { headers: ebayHeaders(token) }
        );
        const data = await res.json();
        return Response.json(data, { status: res.status });
      }

      case "category-aspects": {
        const categoryId = searchParams.get("categoryId") || "";
        if (!categoryId) return Response.json({ error: "categoryId required" }, { status: 400 });
        const res = await fetch(
          `${baseUrl}/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
          { headers: ebayHeaders(token) }
        );
        const data = await res.json();
        // Return only the required aspects with their allowed values + mode
        const required = (data.aspects || [])
          .filter((a: any) => a.aspectConstraint?.aspectRequired)
          .map((a: any) => ({
            localizedAspectName: a.localizedAspectName,
            aspectConstraint: {
              aspectRequired: true,
              aspectMode: a.aspectConstraint?.aspectMode,
            },
            aspectValues: a.aspectValues,
          }));
        return Response.json({ aspects: required }, { status: res.status });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "eBay API request failed" },
      { status: 500 }
    );
  }
}

// POST - Create/update listings, publish offers, mark shipped
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, env = "production", token: bodyToken, ...payload } = body;
  let token = bodyToken || EBAY_TOKEN;

  // Fall back to Redis-stored OAuth token
  if (!token) {
    token = await getTokenFromRedis();
  }

  const baseUrl = getBaseUrl(env);

  if (!token) {
    return Response.json({ error: "No eBay token configured" }, { status: 401 });
  }

  try {
    switch (action) {
      case "create-inventory-item": {
        const { sku, ...itemData } = payload;
        if (!sku) return Response.json({ error: "SKU required" }, { status: 400 });
        const res = await fetch(
          `${baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
          {
            method: "PUT",
            headers: ebayHeaders(token),
            body: JSON.stringify(itemData),
          }
        );
        if (res.status === 204) return Response.json({ success: true, sku });
        const data = await res.json().catch(() => ({}));
        return Response.json(data, { status: res.status });
      }

      case "create-offer": {
        const res = await fetch(`${baseUrl}/sell/inventory/v1/offer`, {
          method: "POST",
          headers: ebayHeaders(token),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
      }

      case "publish-offer": {
        const { offerId } = payload;
        if (!offerId) return Response.json({ error: "offerId required" }, { status: 400 });
        const res = await fetch(
          `${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`,
          {
            method: "POST",
            headers: ebayHeaders(token),
          }
        );
        const data = await res.json().catch(() => ({ success: true }));
        return Response.json(data, { status: res.status });
      }

      case "end-listing": {
        const { offerId } = payload;
        if (!offerId) return Response.json({ error: "offerId required" }, { status: 400 });
        const res = await fetch(
          `${baseUrl}/sell/inventory/v1/offer/${offerId}`,
          {
            method: "DELETE",
            headers: ebayHeaders(token),
          }
        );
        if (res.status === 204) return Response.json({ success: true });
        const data = await res.json().catch(() => ({}));
        return Response.json(data, { status: res.status });
      }

      case "mark-shipped": {
        const { orderId, trackingNumber, carrier } = payload;
        if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });
        const shipmentBody = {
          lineItems: payload.lineItems || [],
          shippingCarrierCode: carrier || "",
          trackingNumber: trackingNumber || "",
        };
        const res = await fetch(
          `${baseUrl}/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`,
          {
            method: "POST",
            headers: ebayHeaders(token),
            body: JSON.stringify(shipmentBody),
          }
        );
        const data = await res.json().catch(() => ({ success: true }));
        return Response.json(data, { status: res.status });
      }

      case "update-offer": {
        const { offerId, ...offerData } = payload;
        if (!offerId) return Response.json({ error: "offerId required" }, { status: 400 });
        const res = await fetch(
          `${baseUrl}/sell/inventory/v1/offer/${offerId}`,
          {
            method: "PUT",
            headers: ebayHeaders(token),
            body: JSON.stringify(offerData),
          }
        );
        if (res.status === 204) return Response.json({ success: true });
        const data = await res.json().catch(() => ({}));
        return Response.json(data, { status: res.status });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "eBay API request failed" },
      { status: 500 }
    );
  }
}
