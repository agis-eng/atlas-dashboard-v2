// app/api/listings/batch/analyze/route.ts
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { applyRouting, ShippabilityRecommendation } from "@/lib/marketplace-batch";
import { buildShippabilityPrompt, ShippabilityOutput } from "@/lib/marketplace-prompts";
import { getEbayPriceSuggestion } from "@/lib/ebay-price";

const anthropic = new Anthropic();

export const maxDuration = 300;

interface IncomingGroup {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  lowConfidence: boolean;
  confidenceReason?: string;
}

interface Draft {
  productId: string;
  photoIds: string[];
  blobUrls: string[];
  title: string;
  description: string;
  condition: string;
  price: number;
  weight_lbs: number;
  dims_in: { length: number; width: number; height: number };
  category: string;
  brand?: string;
  quantity: number;
  routing: ShippabilityRecommendation;
  routingReason: string;
  estimatedProfit: number;
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
  status: "ready" | "needs_review";
}

async function callAnalyze(
  blobUrls: string[],
  baseUrl: string,
  cookieHeader: string,
  serviceKey: string
): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Cookie: cookieHeader };
  if (serviceKey) headers["X-Service-Key"] = serviceKey;
  const res = await fetch(`${baseUrl}/api/listings/analyze`, {
    method: "POST",
    headers,
    body: JSON.stringify({ photos: blobUrls }),
  });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  return res.json();
}

async function callShippability(input: {
  estimated_value_usd: number;
  weight_lbs: number;
  longest_side_in: number;
  category: string;
}): Promise<ShippabilityOutput | null> {
  try {
    const prompt = buildShippabilityPrompt(input);
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    const raw = textBlock.text.replace(/```json\s*|\s*```/g, "").trim();
    return JSON.parse(raw) as ShippabilityOutput;
  } catch (err) {
    console.error("[batch/analyze] shippability failed", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { groups } = await request.json() as { groups: IncomingGroup[] };
    if (!Array.isArray(groups) || groups.length === 0) {
      return Response.json({ drafts: [] });
    }

    const baseUrl = new URL(request.url).origin;
    const cookieHeader = request.headers.get("cookie") || "";
    const serviceKey = request.headers.get("x-service-key") || "";

    const drafts: Draft[] = [];
    for (const group of groups) {
      try {
        const analyzed = await callAnalyze(group.blobUrls, baseUrl, cookieHeader, serviceKey);

        const ai = analyzed?.analysis || {};
        const value = Number(ai.suggestedPrice) || 0;
        const weight = (Number(ai.suggestedWeightOz) || 16) / 16;
        const dims = {
          length: Number(ai.suggestedLengthIn) || 8,
          width: Number(ai.suggestedWidthIn) || 8,
          height: Number(ai.suggestedHeightIn) || 4,
        };
        const longestSide = Math.max(dims.length, dims.width, dims.height);

        const shippability = await callShippability({
          estimated_value_usd: value,
          weight_lbs: weight,
          longest_side_in: longestSide,
          category: ai.suggestedCategory || "general",
        });

        const recommendation: ShippabilityRecommendation = shippability?.recommendation || "local_only";
        const routing = applyRouting(recommendation);

        // Try eBay price research — use it if found, fall back to AI estimate
        let finalPrice = value;
        if (ai.suggestedTitle) {
          const ebay = await getEbayPriceSuggestion(ai.suggestedTitle).catch(() => null);
          if (ebay?.suggestedPrice) finalPrice = ebay.suggestedPrice;
        }

        const hasTitleAndPrice = !!ai.suggestedTitle && finalPrice > 0;
        const status: Draft["status"] = (group.lowConfidence || !hasTitleAndPrice) ? "needs_review" : "ready";

        drafts.push({
          productId: group.productId,
          photoIds: group.photoIds,
          blobUrls: group.blobUrls,
          title: ai.suggestedTitle || "",
          description: ai.suggestedDescription || "",
          condition: "New", // default every batch-listed item to New; user overrides per-item in the UI
          price: finalPrice,
          weight_lbs: weight,
          dims_in: dims,
          category: ai.suggestedCategory || "",
          brand: "", // leave brand empty unless the seller fills it in (→ "No brand / Not sure" on Mercari)
          quantity: 1,
          routing: recommendation,
          routingReason: shippability?.reason || "Shippability check failed; defaulted to local",
          estimatedProfit: shippability?.estimated_profit_if_shipped_usd ?? 0,
          platforms: routing.platforms,
          facebookLocalOnly: routing.facebookLocalOnly,
          status,
        });
      } catch (err) {
        drafts.push({
          productId: group.productId,
          photoIds: group.photoIds,
          blobUrls: group.blobUrls,
          title: "",
          description: "",
          condition: "New",
          price: 0,
          weight_lbs: 1,
          dims_in: { length: 8, width: 8, height: 4 },
          category: "",
          quantity: 1,
          routing: "local_only",
          routingReason: `Analyze failed: ${(err as Error).message}`,
          estimatedProfit: 0,
          platforms: { ebay: false, mercari: false, facebook: true },
          facebookLocalOnly: true,
          status: "needs_review",
        });
      }
    }

    return Response.json({ drafts });
  } catch (err) {
    console.error("[batch/analyze] error", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
