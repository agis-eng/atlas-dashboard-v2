import { NextRequest } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY || "";

async function callGemini(model: string, contents: any[], config?: any) {
  const res = await fetch(`${GEMINI_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: config }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return Response.json({ error: "Gemini API key not configured" }, { status: 500 });
  }

  const { action, image, prompt, inspirationImage } = await request.json();

  try {
    switch (action) {
      case "detect-bg": {
        if (!image) return Response.json({ error: "Image required" }, { status: 400 });
        const cleanBase64 = image.replace(/^data:image\/[^;]+;base64,/, "");
        const data = await callGemini("gemini-2.5-flash", [
          {
            parts: [
              { inlineData: { data: cleanBase64, mimeType: "image/png" } },
              { text: 'Identify the primary background colors in this logo/image that should be made transparent. Return ONLY a JSON array of hex color codes (e.g. ["#ffffff", "#f0f0f0"]). No other text.' },
            ],
          },
        ], { responseMimeType: "application/json" });

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        return Response.json({ colors: JSON.parse(text) });
      }

      case "remove-bg-pro": {
        if (!image) return Response.json({ error: "Image required" }, { status: 400 });
        if (!REMOVEBG_API_KEY) {
          return Response.json({ error: "remove.bg API key not configured. Add REMOVEBG_API_KEY to Vercel env vars." }, { status: 500 });
        }

        const imgBase64 = image.replace(/^data:image\/[^;]+;base64,/, "");
        const formData = new FormData();
        // Convert base64 to blob for the API
        const binaryStr = atob(imgBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });
        formData.append("image_file", blob, "logo.png");
        formData.append("size", "auto");

        const rbgRes = await fetch("https://api.remove.bg/v1.0/removebg", {
          method: "POST",
          headers: { "X-Api-Key": REMOVEBG_API_KEY },
          body: formData,
        });

        if (!rbgRes.ok) {
          const errText = await rbgRes.text();
          return Response.json({ error: `remove.bg error (${rbgRes.status}): ${errText}` }, { status: 500 });
        }

        const resultBuffer = await rbgRes.arrayBuffer();
        const resultBase64 = Buffer.from(resultBuffer).toString("base64");
        return Response.json({ image: `data:image/png;base64,${resultBase64}` });
      }

      case "deep-detect": {
        if (!image) return Response.json({ error: "Image required" }, { status: 400 });
        const deepCleanBase64 = image.replace(/^data:image\/[^;]+;base64,/, "");
        const deepData = await callGemini("gemini-2.5-flash", [
          {
            parts: [
              { inlineData: { data: deepCleanBase64, mimeType: "image/jpeg" } },
              { text: 'Analyze this logo image. Identify ALL colors that are part of the BACKGROUND (not the logo itself). Include the main background color, any gradient colors, brush stroke colors, shadow colors, and any other non-logo colors. Be very thorough — include dark colors, light colors, grays, and any texture colors that are behind the logo elements. Return ONLY a JSON array of hex color codes. Include at least 5-15 colors covering the full range of background shades. Example: ["#ffffff", "#f5f5f5", "#1a1a2e", "#2d2d44", "#0d0d1a"]' },
            ],
          },
        ], { responseMimeType: "application/json" });

        const deepText = deepData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        return Response.json({ colors: JSON.parse(deepText) });
      }

      case "generate": {
        if (!prompt) return Response.json({ error: "Prompt required" }, { status: 400 });
        const parts: any[] = [];

        if (inspirationImage) {
          const clean = inspirationImage.replace(/^data:image\/[^;]+;base64,/, "");
          parts.push({ inlineData: { data: clean, mimeType: "image/png" } });
        }

        parts.push({ text: prompt });

        const data = await callGemini("gemini-2.5-flash-image", [{ parts }], {
          responseModalities: ["IMAGE"],
        });

        const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (imagePart?.inlineData?.data) {
          const dataUrl = `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
          return Response.json({ image: dataUrl });
        }
        return Response.json({ error: "No image generated" }, { status: 500 });
      }

      case "upscale": {
        if (!image) return Response.json({ error: "Image required" }, { status: 400 });
        const clean = image.replace(/^data:image\/[^;]+;base64,/, "");
        const data = await callGemini("gemini-2.5-flash-image", [
          {
            parts: [
              { inlineData: { data: clean, mimeType: "image/png" } },
              { text: "LITERAL UPSCALE: Create a higher resolution version of this EXACT image. DO NOT change the design, text, colors, or layout. Maintain everything perfectly. Make it 2x resolution. Output on a pure white (#FFFFFF) background." },
            ],
          },
        ], { responseModalities: ["IMAGE"] });

        const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (imagePart?.inlineData?.data) {
          return Response.json({
            image: `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`,
          });
        }
        return Response.json({ error: "Upscale failed" }, { status: 500 });
      }

      case "deep-clean": {
        if (!image) return Response.json({ error: "Image required" }, { status: 400 });
        const cleanImg = image.replace(/^data:image\/[^;]+;base64,/, "");

        // Use Gemini to recreate the logo on a bright green background for easy chroma keying
        const data = await callGemini("gemini-2.5-flash-image", [
          {
            parts: [
              { inlineData: { data: cleanImg, mimeType: "image/png" } },
              {
                text: "RECREATE this EXACT logo precisely as it appears — same text, same fonts, same colors, same shapes, same layout. IMPORTANT: Remove ALL background elements including brush strokes, textures, gradients, shadows, and decorative backgrounds. Keep ONLY the core logo elements (text, icons, symbols). Place the clean logo on a perfectly solid, uniform pure white (#FFFFFF) background. The white background must be exactly #FFFFFF everywhere with absolutely no variation, gradients, or shadows. Clean crisp edges on all logo elements.",
              },
            ],
          },
        ], { responseModalities: ["IMAGE"] });

        const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (imgPart?.inlineData?.data) {
          return Response.json({
            image: `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`,
          });
        }
        return Response.json({ error: "Deep clean failed" }, { status: 500 });
      }

      case "suggest-styles": {
        if (!prompt) return Response.json({ error: "Description required" }, { status: 400 });
        const data = await callGemini("gemini-2.5-flash", [
          {
            parts: [
              {
                text: `You are a brand designer. Based on this business description, suggest 3 different logo style directions with color palettes.

Business: ${prompt}

Return ONLY a JSON array of 3 objects:
[
  {
    "style": "Style name (e.g. Minimalist Modern)",
    "description": "Brief description of the visual approach",
    "colors": ["#hex1", "#hex2", "#hex3"],
    "prompt": "Detailed logo generation prompt for this style"
  }
]`,
              },
            ],
          },
        ], { responseMimeType: "application/json" });

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        return Response.json({ styles: JSON.parse(text) });
      }

      case "research": {
        if (!prompt) return Response.json({ error: "URL required" }, { status: 400 });
        const data = await callGemini("gemini-2.5-flash", [
          {
            parts: [
              { text: `Research this business/website and provide a brief summary of their brand, industry, target audience, and personality to help design a logo: ${prompt}` },
            ],
          },
        ]);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return Response.json({ description: text });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 }
    );
  }
}
