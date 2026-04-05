import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { photos } = await request.json();

    if (!photos || photos.length === 0) {
      return Response.json({ error: "No photos provided" }, { status: 400 });
    }

    // Read photo files and build content blocks for Claude Vision
    const imageBlocks: Anthropic.Messages.ImageBlockParam[] = [];

    for (const photoUrl of photos.slice(0, 6)) {
      const filePath = path.join(process.cwd(), "public", photoUrl);
      try {
        const buffer = await readFile(filePath);
        const base64 = buffer.toString("base64");
        const ext = photoUrl.split(".").pop()?.toLowerCase();
        const mediaType =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "png"
            ? "image/png"
            : ext === "webp"
            ? "image/webp"
            : "image/jpeg";

        imageBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as any,
            data: base64,
          },
        });
      } catch {
        console.error(`Failed to read photo: ${photoUrl}`);
      }
    }

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

Analyze these product photos and generate listing details. Return ONLY valid JSON with this structure:

{
  "suggestedTitle": "concise, keyword-rich title under 80 chars for search visibility",
  "suggestedDescription": "3-5 sentence description highlighting key features, condition, dimensions/specs if visible. Include relevant keywords buyers search for.",
  "suggestedPrice": 25,
  "suggestedCategory": "most specific category like 'Electronics > Video Games > Controllers'",
  "suggestedCondition": "one of: New, Like New, Good, Fair, Poor",
  "confidence": "high, medium, or low - how confident you are in the identification"
}

For pricing: estimate a fair market price based on what this item typically sells for on eBay/Mercari. Consider condition. If unsure, estimate conservatively.

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
