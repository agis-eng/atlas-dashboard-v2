import { GoogleGenAI, Modality } from "@google/genai";

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  "";

export async function POST(request: Request) {
  try {
    if (!GOOGLE_API_KEY) {
      return Response.json(
        { error: "Google Gemini API key is not configured for Voice Lab." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const model = String(body.model || "gemini-3.1-flash-live-preview");
    const voiceName = String(body.voiceName || "Kore");
    const systemInstruction = String(
      body.systemInstruction ||
        "You are Atlas Voice Lab. Respond conversationally, clearly, and briefly."
    );

    const ai = new GoogleGenAI({
      apiKey: GOOGLE_API_KEY,
      apiVersion: "v1alpha",
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: [Modality.TEXT, Modality.AUDIO],
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
          },
        },
      },
    });

    const tokenData = token as any;

    return Response.json({
      token: tokenData.name,
      model,
      voiceName,
      expiresAt: tokenData.expireTime || null,
      newSessionExpiresAt: tokenData.newSessionExpireTime || null,
    });
  } catch (error: any) {
    console.error("Voice Lab session error:", error);
    return Response.json(
      { error: error.message || "Failed to create Voice Lab session" },
      { status: 500 }
    );
  }
}
