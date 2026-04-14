import { NextRequest } from "next/server";

const SANDBOX_API = "https://api.sandbox.ebay.com";
const PRODUCTION_API = "https://api.ebay.com";

function getBaseUrl(env: string) {
  return env === "production" ? PRODUCTION_API : SANDBOX_API;
}

function ebayHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const env = searchParams.get("env") || "production";
  const baseUrl = getBaseUrl(env);

  // Get token from auth store
  const origin = new URL(request.url).origin;
  let token: string;
  try {
    const res = await fetch(`${origin}/api/ebay/auth?action=token`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    token = data.access_token;
  } catch {
    return Response.json(
      { error: "Not connected to eBay. Please authorize first." },
      { status: 401 }
    );
  }

  try {
    const [fulfillmentRes, returnRes, paymentRes] = await Promise.all([
      fetch(`${baseUrl}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, {
        headers: ebayHeaders(token),
      }),
      fetch(`${baseUrl}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, {
        headers: ebayHeaders(token),
      }),
      fetch(`${baseUrl}/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, {
        headers: ebayHeaders(token),
      }),
    ]);

    const [fulfillmentData, returnData, paymentData] = await Promise.all([
      fulfillmentRes.json().catch(() => ({})),
      returnRes.json().catch(() => ({})),
      paymentRes.json().catch(() => ({})),
    ]);

    const policies = {
      fulfillmentPolicyId:
        fulfillmentData.fulfillmentPolicies?.[0]?.fulfillmentPolicyId || "",
      returnPolicyId:
        returnData.returnPolicies?.[0]?.returnPolicyId || "",
      paymentPolicyId:
        paymentData.paymentPolicies?.[0]?.paymentPolicyId || "",
    };

    return Response.json({ policies });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch eBay policies" },
      { status: 500 }
    );
  }
}
