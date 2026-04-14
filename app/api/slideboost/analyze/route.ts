import { analyzeAndReviseSlide } from "@/lib/slideboost/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { base64, mimeType, instruction, logoBase64, logoMimeType } =
      await request.json();
    if (!base64 || !mimeType) {
      return Response.json({ error: "Missing base64 or mimeType" }, { status: 400 });
    }
    const result = await analyzeAndReviseSlide(
      base64,
      mimeType,
      instruction,
      logoBase64,
      logoMimeType,
    );
    return Response.json(result);
  } catch (e) {
    console.error("slideboost/analyze error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
