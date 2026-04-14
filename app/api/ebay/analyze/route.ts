import Anthropic from "@anthropic-ai/sdk";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function POST(request: Request) {
  if (!anthropic) {
    return Response.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  const { imageUrls } = await request.json();

  if (!imageUrls?.length) {
    return Response.json({ error: "No image URLs provided" }, { status: 400 });
  }

  // Build image content blocks for Claude vision
  const imageBlocks: Anthropic.Messages.ContentBlockParam[] = [];
  for (const url of imageUrls.slice(0, 8)) {
    imageBlocks.push({
      type: "image",
      source: { type: "url", url },
    });
  }

  imageBlocks.push({
    type: "text",
    text: `You are an expert eBay seller. Analyze these product photos and generate an optimized eBay listing.

Return a JSON object with these fields:
{
  "title": "eBay-optimized title (max 80 chars, include brand/model/key details, use keywords buyers search for)",
  "description": "Detailed plain text description. Include condition details, dimensions if visible, features, what's included. Use newlines for paragraphs. No HTML tags. Be thorough but honest.",
  "price": "suggested price as a number string (e.g. \"29.99\"). Base this on what similar items typically sell for on eBay. Price slightly below the average to sell faster.",
  "condition": "one of: NEW, LIKE_NEW, NEW_OTHER, USED_EXCELLENT, USED_VERY_GOOD, USED_GOOD, USED_ACCEPTABLE, FOR_PARTS_OR_NOT_WORKING",
  "categoryKeywords": "2-3 words for eBay category search (e.g. \"vintage watch\" or \"gaming mouse\")",
  "shipping": {
    "weightLbs": "estimated weight in pounds as a number (e.g. 2.5). Use your knowledge of the product. Include packaging weight.",
    "lengthIn": "package length in inches as a number",
    "widthIn": "package width in inches as a number",
    "heightIn": "package height in inches as a number",
    "packageType": "one of: LETTER, LARGE_ENVELOPE, PACKAGE, LARGE_PACKAGE"
  }
}

Return ONLY the JSON object, no other text.`,
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: imageBlocks,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "Failed to parse AI response", raw: text }, { status: 500 });
    }

    let listing;
    try {
      listing = JSON.parse(jsonMatch[0]);
    } catch {
      return Response.json({ error: "Invalid JSON in AI response" }, { status: 500 });
    }

    // Ensure required fields exist with defaults
    listing.title = listing.title || "Untitled Item";
    listing.description = listing.description || "";
    listing.price = listing.price || "0";
    listing.condition = listing.condition || "USED_GOOD";
    listing.categoryKeywords = listing.categoryKeywords || "";

    return Response.json(listing);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "AI analysis failed" },
      { status: 500 }
    );
  }
}
