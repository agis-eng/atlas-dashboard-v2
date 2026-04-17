// Server-side Gemini helpers used by /api/slideboost/* routes.
// The API key stays on the server — never expose it to the browser.
import { GoogleGenAI, Type } from "@google/genai";

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

function stripPrefix(b64: string) {
  return b64.includes(",") ? b64.split(",")[1] : b64;
}

function firstInlineImage(response: any): string | null {
  for (const part of response?.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function editSlideImage(
  slideBase64: string,
  slideMime: string,
  instruction: string,
  refImageBase64?: string,
  refImageMime?: string,
) {
  const ai = client();
  const model = "gemini-3-pro-image-preview";

  const parts: any[] = [
    { inlineData: { data: stripPrefix(slideBase64), mimeType: slideMime } },
  ];

  if (refImageBase64 && refImageMime) {
    parts.push({
      inlineData: { data: stripPrefix(refImageBase64), mimeType: refImageMime },
    });
  }

  const promptText = `ACT AS A SENIOR VISUAL DESIGNER AND IMAGE COMPOSITOR.

      TASK: Modify the source image (Image 1) based on the user's command${refImageBase64 ? " and the reference image (Image 2)" : ""}.

      USER COMMAND: "${instruction}"

      ${refImageBase64 ? "REFERENCE INSTRUCTION: Use the second image as a visual inspiration. Incorporate visual elements, style, composition, or specific objects from it into the first image as implied by the command." : ""}

      STRICT OPERATIONAL GUIDELINES:
      1. EXECUTE GEOMETRIC CHANGES AGGRESSIVELY:
         - If asked to "CENTER": You MUST physically move the content to the center of the canvas. Erase it from the original spot.
         - If asked to "REDUCE FONT SIZE": You MUST re-render the text significantly smaller.
         - If asked to "MOVE": Change the X/Y coordinates of the element.

      2. DESTRUCTIVE EDITING IS REQUIRED:
         - The original layout is NOT sacred. Break it if the instruction requires it.
         - If moving an object, the original location must be cleanly erased (background pattern extended/inpainted).
         - The new location must seamlessly integrate the object.

      3. TEXT FIDELITY:
         - If reducing text size, ensure the text remains legible and sharp.
         - Maintain the original font style unless asked to change it.

      4. PRESERVE BRANDING:
         - Keep colors and logos consistent, only change the spatial layout or size as requested.

      FAILURE CASE TO AVOID:
      - Do NOT return an image that looks exactly like the original.
      - The change must be visually obvious to the user.

      Return the fully composited, high-resolution (2K) image.`;

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      imageConfig: { imageSize: "2K" },
    },
  });

  const out = firstInlineImage(response);
  if (!out) throw new Error("Image modification failed.");
  return out;
}

export async function upscaleSlideImage(slideBase64: string, slideMime: string) {
  const ai = client();
  const model = "gemini-3-pro-image-preview";

  const parts = [
    { inlineData: { data: stripPrefix(slideBase64), mimeType: slideMime } },
    {
      text: `Act as a high-end image restoration AI.

      TASK: Restore and Upscale this slide.

      1. SHARPEN TEXT: Re-render any blurry or pixelated text to be crisp, vector-like quality.
      2. REMOVE ARTIFACTS: Clean up any JPEG compression noise.
      3. PRESERVE CONTENT: Do NOT change the words or layout. Only improve the fidelity.
      4. OUTPUT: Return a high-definition 2K image.

      Return only the enhanced image as a base64 data string.`,
    },
  ];

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: { imageConfig: { imageSize: "2K" } },
  });

  const out = firstInlineImage(response);
  if (!out) throw new Error("Upscaling failed.");
  return out;
}

export async function replaceLogo(
  slideBase64: string,
  slideMime: string,
  logoBase64: string,
  logoMime: string,
) {
  const ai = client();
  const model = "gemini-2.5-flash-image";

  const parts = [
    { inlineData: { data: stripPrefix(slideBase64), mimeType: slideMime } },
    { inlineData: { data: stripPrefix(logoBase64), mimeType: logoMime } },
    {
      text: `TASK: DIRECT PIXEL REPLACEMENT.
      1. Image 1 is a slide.
      2. Image 2 is a BRAND LOGO.

      INSTRUCTION:
      Locate the existing watermark or logo on the slide (usually bottom right or bottom left).
      REMOVE the existing watermark completely.
      OVERLAY the EXACT, UNMODIFIED pixels from Image 2 in its place.

      STRICT RULES:
      - DO NOT RENDER A NEW VERSION OF THE LOGO.
      - DO NOT CHANGE COLORS, FONTS, OR SHAPES OF IMAGE 2.
      - DO NOT BE CREATIVE.
      - TREAT IMAGE 2 AS A LITERAL STICKER TO BE COMPOSITED.
      - IF YOU CANNOT PERFORM A PERFECT PIXEL-FOR-PIXEL TRANSFER, SIMPLY REMOVE THE OLD BRANDING AND RETURN THE CLEANED SLIDE.`,
    },
  ];

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
  });

  const out = firstInlineImage(response);
  if (!out) throw new Error("Logo replacement failed.");
  return out;
}

export async function removeNotebookLMLogo(base64WithPrefix: string, mimeType: string) {
  const ai = client();
  const model = "gemini-3-pro-image-preview";

  const prompt = `TASK: Remove the NotebookLM badge in the lower-right corner of this slide and inpaint the area so the removal is seamless.

ABOUT THE BADGE — what you're looking for:
- NotebookLM stamps every slide it generates with a small identifying badge in the LOWER-RIGHT corner.
- It is typically a compact rounded capsule/pill or small icon-plus-text element.
- Common forms: a colorful sparkle/star icon, a "NotebookLM" text label, or an icon+text combo. It may be solid-colored, translucent, or partially blended into the slide background.
- It sits ON TOP of the slide's underlying design — always a superimposed overlay, never part of the slide's native layout.
- It can appear on any background: light, dark, photographic, or over illustrations. It may be subtle (low-contrast, semi-transparent) but it is ALWAYS present.

INSTRUCTIONS — assume the badge is present unless you are certain it is not:
- Scan the entire lower-right region of the image thoroughly. Do not require a specific size, color, or exact position — only that it is a superimposed overlay in that corner.
- If you see ANY element in the lower-right corner that could plausibly be a NotebookLM identifier (any icon, capsule, small text label, sparkle/star mark, or similar superimposed graphic), remove it and inpaint the area using the surrounding background pixels for a seamless result.
- Err on the side of removal: if you're uncertain whether something is a badge or part of the design, and it's in the lower-right corner AND has the character of an overlaid mark (isolated, small, looks "applied"), remove it.
- Only return the image unchanged if the lower-right corner is completely clean with absolutely nothing overlaid on it.

ABSOLUTE PROHIBITIONS — these apply in every case:
- DO NOT add, draw, render, or invent any new logo, badge, watermark, text, or icon anywhere in the image.
- DO NOT remove, edit, recolor, reposition, or restyle any headline, subheading, body copy, bullet, caption, label, number, or any other text on the slide.
- DO NOT remove, edit, recolor, reposition, or restyle any illustration, photo, chart, diagram, icon, shape, or decorative graphic that is part of the slide's own composition.
- DO NOT change the background, colors, layout, framing, or aspect ratio.
- DO NOT touch anything outside the lower-right corner region.

The output must be pixel-identical to the input everywhere except the lower-right region where the NotebookLM badge was removed.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { data: stripPrefix(base64WithPrefix), mimeType } },
        { text: prompt },
      ],
    },
    config: {
      imageConfig: { imageSize: "2K" },
    },
  });

  const out = firstInlineImage(response);
  if (!out) throw new Error("NotebookLM logo removal failed.");
  return out;
}

export async function removeWatermark(base64WithPrefix: string, mimeType: string) {
  const ai = client();
  const model = "gemini-2.5-flash-image";

  const prompt =
    "Analyze this slide image. Identify any watermarks, logos, or website URLs overlaid on the design. Remove them completely and fill the resulting area with a seamless background that matches the surrounding texture and colors exactly. Do not modify the main text or content of the slide.";

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { data: stripPrefix(base64WithPrefix), mimeType } },
        { text: prompt },
      ],
    },
  });

  const out = firstInlineImage(response);
  if (!out) throw new Error("Cleanup failed.");
  return out;
}

export async function analyzeAndReviseSlide(
  base64WithPrefix: string,
  mimeType: string,
  userInstruction?: string,
  logoBase64WithPrefix?: string,
  logoMimeType?: string,
) {
  const ai = client();
  const model = "gemini-3-pro-preview";

  const systemInstruction = `
    You are a world-class presentation strategist and creative director.
    Analyze the slide and provide:
    1. Extracted text (verbatim).
    2. A luxury-tier revision of the copy that is punchier and more persuasive.
    3. Three specific strategic improvements based on visual hierarchy and messaging.
    ${logoBase64WithPrefix ? "Ensure the tone and messaging align with the premium visual identity of the provided brand logo." : ""}
  `;

  const parts: any[] = [
    { text: userInstruction || "Refine this content for a high-net-worth professional audience." },
    { inlineData: { data: stripPrefix(base64WithPrefix), mimeType } },
  ];

  if (logoBase64WithPrefix && logoMimeType) {
    parts.push({
      inlineData: { data: stripPrefix(logoBase64WithPrefix), mimeType: logoMimeType },
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extractedText: { type: Type.STRING },
          suggestedRevision: { type: Type.STRING },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["extractedText", "suggestedRevision", "improvements"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}
