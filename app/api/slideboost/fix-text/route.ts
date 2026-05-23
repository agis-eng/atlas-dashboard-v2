import { fixTextOnSlide } from "@/lib/slideboost/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { slideBase64, slideMime, instruction } = await request.json();
    if (!slideBase64 || !slideMime || !instruction) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    const image = await fixTextOnSlide(slideBase64, slideMime, instruction);
    return Response.json({ image });
  } catch (e) {
    console.error("slideboost/fix-text error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Text fix failed" },
      { status: 500 },
    );
  }
}
