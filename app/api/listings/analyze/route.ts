import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { visionImageUrl, VISION_MAX_IMAGES } from "@/lib/vision-image";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { getServiceOrSessionUser } = await import("@/lib/auth");
    const user = await getServiceOrSessionUser(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { photos, existingTitle } = await request.json();

    if (!photos || photos.length === 0) {
      return Response.json({ error: "No photos provided" }, { status: 400 });
    }

    // Send Anthropic downscaled photo URLs (via the image optimizer). The model
    // fetches them server-side — bypassing the 5 MB base64 cap — and the smaller
    // size roughly halves image input tokens. A few angles are enough to title.
    const baseUrl = new URL(request.url).origin;
    const imageBlocks: Anthropic.Messages.ImageBlockParam[] = photos
      .slice(0, VISION_MAX_IMAGES)
      .map((photoUrl: string) => ({
        type: "image",
        source: { type: "url", url: visionImageUrl(photoUrl, baseUrl) },
      }));

    if (imageBlocks.length === 0) {
      return Response.json({ error: "Could not read any photos" }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `You are an expert at creating product listings for online marketplaces (eBay, Mercari, Facebook Marketplace).
${existingTitle ? `\nIMPORTANT: The seller has already identified this item as: "${existingTitle}". Accept this as correct — do NOT suggest a different title. Use this exact product identity when writing the description and selecting category.\n` : ""}
Analyze these product photos and generate listing details. Return ONLY valid JSON with this structure:

{
  "suggestedTitle": ${existingTitle ? `"${existingTitle}"` : '"concise, keyword-rich title under 80 chars for search visibility"'},
  "suggestedDescription": "3-5 sentence description highlighting key features, condition, dimensions/specs if visible. Include relevant keywords buyers search for.",
  "suggestedPrice": 25,
  "suggestedCategory": "most specific category like 'Electronics > Video Games > Controllers'",
  "suggestedCondition": "one of: New, Like New, Good, Fair, Poor",
  "suggestedType": "the item type/product type for eBay item specifics (e.g. 'Action Figure', 'Smartphone', 'T-Shirt')",
  "suggestedBrand": "the brand name if identifiable, or 'Unbranded'",
  "suggestedWeightOz": 16,
  "suggestedLengthIn": 10,
  "suggestedWidthIn": 6,
  "suggestedHeightIn": 2,
  "confidence": "high, medium, or low - how confident you are in the identification"
}

For pricing: estimate a fair market price based on what this item typically sells for on eBay/Mercari. Consider condition. If unsure, estimate conservatively.

For weight and dimensions: estimate the PACKAGED shipping size + weight (item + minimal box/padding). Use inches and ounces. Be realistic — small items (phone cases, clothing) are 4-8 oz; medium (shoes, electronics) 16-48 oz; large (appliances) 5-20 lbs (convert to oz). Dimensions should be the bounding-box of a reasonable shipping box for this item.

Return ONLY the JSON object, no markdown or explanation.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON response
    let analysis;
    try {
      // Handle potential markdown code blocks
      const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      analysis = JSON.parse(jsonStr);
      // Standing rule: every listed item defaults to "New". The seller
      // overrides per-item in the UI if an item is genuinely used.
      analysis.suggestedCondition = "New";
      // Standing rule: leave brand empty unless the seller fills it in.
      // Empty brand maps to "No brand / Not sure" on Mercari.
      analysis.suggestedBrand = "";
    } catch {
      console.error("Failed to parse AI response:", text);
      return Response.json(
        { error: "AI returned invalid response", raw: text },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    console.error("Listing analysis error:", error);
    return Response.json(
      { error: "Failed to analyze photos", details: error.message },
      { status: 500 }
    );
  }
}
