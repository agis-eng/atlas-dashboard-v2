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

// Image model fallback chain (preferred → fallback):
//   1. gemini-3-pro-image-preview     — primary (Nano Banana Pro, most capable for surgical edits)
//   2. gemini-3.1-flash-image-preview — fallback (Nano Banana 2)
//   3. gemini-2.5-flash-image         — last-resort fallback
async function generateImageWithFallback(
  ai: any,
  parts: any[],
  config?: any,
): Promise<{ response: any; modelUsed: string }> {
  const CHAIN = [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
  ];
  let lastError: any = null;
  for (const model of CHAIN) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        ...(config ? { config } : {}),
      });
      if (model !== CHAIN[0]) {
        console.warn(`[slideboost] used fallback model: ${model}`);
      }
      return { response, modelUsed: model };
    } catch (e: any) {
      lastError = e;
      const msg = e?.message || String(e);
      const isUnavailable =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand") ||
        msg.includes("quota") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("429") ||
        msg.includes("not found") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("404");
      if (!isUnavailable) throw e;
      console.warn(`[slideboost] ${model} unavailable (${msg.slice(0, 100)}), trying next…`);
    }
  }
  throw lastError ?? new Error("All image models unavailable");
}

export async function editSlideImage(
  slideBase64: string,
  slideMime: string,
  instruction: string,
  refImageBase64?: string,
  refImageMime?: string,
) {
  const ai = client();

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

      4. PRESERVE UNREQUESTED ELEMENTS:
         - Only modify what the user's command targets. Leave all other slide elements (text, layout, colors, branding) unchanged.
         - If the user explicitly asks to REMOVE, REPLACE, or MODIFY a logo, watermark, badge, or branding element, you MUST execute that instruction — remove the element completely and inpaint the area seamlessly with the surrounding background.

      FAILURE CASE TO AVOID:
      - Do NOT return an image that looks exactly like the original when the user requested a change.
      - The requested change must be visually obvious to the user.
      - If the user asked to remove something, it MUST be gone in the output.

      Return the fully composited, high-resolution (2K) image.`;

  parts.push({ text: promptText });

  const { response } = await generateImageWithFallback(ai, parts, {
    imageConfig: { imageSize: "2K" },
  });

  const out = firstInlineImage(response);
  if (!out) throw new Error("Image modification failed.");
  return out;
}

export async function upscaleSlideImage(slideBase64: string, slideMime: string) {
  const ai = client();

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

  const { response } = await generateImageWithFallback(ai, parts, {
    imageConfig: { imageSize: "2K" },
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

  const { response } = await generateImageWithFallback(ai, parts);

  const out = firstInlineImage(response);
  if (!out) throw new Error("Logo replacement failed.");
  return out;
}

export async function removeNotebookLMLogo(base64WithPrefix: string, mimeType: string) {
  // Routes through editSlideImage — the dedicated NotebookLM prompt was being silently
  // ignored by the image models. The editSlideImage prompt is more aggressive about
  // forcing an actual edit and has been proven to work for "remove the logo" instructions.
  return editSlideImage(
    base64WithPrefix,
    mimeType,
    "Remove the NotebookLM logo badge from the lower-right corner of this slide. The badge is a small overlay (sparkle/star icon, sometimes with 'NotebookLM' text, in a rounded capsule shape) that NotebookLM stamps on every slide it generates — it is not part of the original slide design. Erase the badge completely and inpaint the area cleanly using the surrounding background pixels so no trace of it remains. Do not modify any other element of the slide.",
  );
}

export async function removeWatermark(base64WithPrefix: string, mimeType: string) {
  const ai = client();

  const prompt =
    "Analyze this slide image. Identify any watermarks, logos, or website URLs overlaid on the design. Remove them completely and fill the resulting area with a seamless background that matches the surrounding texture and colors exactly. Do not modify the main text or content of the slide.";

  const { response } = await generateImageWithFallback(ai, [
    { inlineData: { data: stripPrefix(base64WithPrefix), mimeType } },
    { text: prompt },
  ]);

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
  const model = "gemini-2.5-pro";

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
