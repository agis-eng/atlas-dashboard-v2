// app/api/listings/batch/analyze/route.ts
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { applyRouting, ShippabilityRecommendation } from "@/lib/marketplace-batch";
import { buildShippabilityPrompt, ShippabilityOutput } from "@/lib/marketplace-prompts";

const anthropic = new Anthropic();

export const maxDuration = 600;

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
  quantity: number;
  routing: ShippabilityRecommendation;
  routingReason: string;
  estimatedProfit: number;
  platforms: { ebay: boolean; mercari: boolean; facebook: boolean };
  facebookLocalOnly: boolean;
  status: "ready" | "needs_review";
}

async function callAnalyze(blobUrls: string[], baseUrl: string, cookieHeader: string): Promise<any> {
  const res = await fetch(`${baseUrl}/api/listings/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
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
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { groups } = await request.json() as { groups: IncomingGroup[] };
    if (!Array.isArray(groups) || groups.length === 0) {
      return Response.json({ drafts: [] });
    }

    const baseUrl = new URL(request.url).origin;
    const cookieHeader = request.headers.get("cookie") || "";

    const drafts: Draft[] = [];
    for (const group of groups) {
      try {
        const analyzed = await callAnalyze(group.blobUrls, baseUrl, cookieHeader);

        const value = Number(analyzed.price) || 0;
        const weight = Number(analyzed.weight_lbs) || 1;
        const dims = analyzed.dims_in || { length: 8, width: 8, height: 4 };
        const longestSide = Math.max(dims.length, dims.width, dims.height);

        const shippability = await callShippability({
          estimated_value_usd: value,
          weight_lbs: weight,
          longest_side_in: longestSide,
          category: analyzed.category || "general",
        });

        const recommendation: ShippabilityRecommendation = shippability?.recommendation || "local_only";
        const routing = applyRouting(recommendation);

        const hasTitleAndPrice = !!analyzed.title && Number(analyzed.price) > 0;
        const status: Draft["status"] = (group.lowConfidence || !hasTitleAndPrice) ? "needs_review" : "ready";

        drafts.push({
          productId: group.productId,
          photoIds: group.photoIds,
          blobUrls: group.blobUrls,
          title: analyzed.title || "",
          description: analyzed.description || "",
          condition: analyzed.condition || "USED_GOOD",
          price: value,
          weight_lbs: weight,
          dims_in: dims,
          category: analyzed.category || "",
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
          condition: "USED_GOOD",
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
