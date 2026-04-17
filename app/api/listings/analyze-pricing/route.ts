import { NextRequest } from "next/server";
import { getRedis, REDIS_KEYS, ListingDraft } from "@/lib/redis";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (!anthropic) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const redis = getRedis();
    const raw = await redis.get(REDIS_KEYS.listings);
    const listings: ListingDraft[] = raw
      ? typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as ListingDraft[])
      : [];
    const active = listings.filter((l) => l.status === "listed");

    if (active.length === 0) {
      return Response.json({ analysis: "No active listings to analyze." });
    }

    // Compact payload — only the fields useful for pricing analysis.
    const items = active.map((l) => {
      const createdAt = new Date(l.createdAt);
      const daysListed = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        title: l.title,
        price: l.price,
        category: l.category,
        brand: l.brand,
        condition: l.condition,
        platforms: [
          l.ebayListingId ? "ebay" : null,
          l.mercariListingUrl ? "mercari" : null,
          l.facebookListingUrl ? "facebook" : null,
        ].filter(Boolean),
        daysListed,
      };
    });

    const prompt = `You're advising a solo reseller reviewing their cross-listed inventory. They cross-post to eBay, Mercari, and Facebook Marketplace. Here are their ${items.length} currently-active listings:

${JSON.stringify(items, null, 2)}

Give actionable feedback in plain prose (no JSON). Cover:

1. **Pricing concerns** — items priced noticeably high or low for their category, relative to what items like this typically sell for on the listed platforms. Note the item title and suggested price range.
2. **Stale listings** — anything listed > 30 days may benefit from a price drop. Suggest target % reduction.
3. **Platform mix** — items listed on only one platform that should probably be cross-posted to others, OR items on too many platforms that don't fit (e.g., heavy/fragile on Mercari).
4. **Bundle candidates** — related items that might sell better as a bundle.
5. **Top 3-5 concrete actions** — ranked, specific ("drop X from $50 to $42 on all platforms").

Keep the response under 600 words. Be direct. The user is a seasoned reseller, not a beginner.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c as any).text)
      .join("\n");

    return Response.json({ analysis: text });
  } catch (error: any) {
    console.error("analyze-pricing error:", error);
    return Response.json(
      { error: "Failed to analyze pricing", details: error.message },
      { status: 500 }
    );
  }
}
