import { upscaleSlideImage } from "@/lib/slideboost/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { slideBase64, slideMime } = await request.json();
    if (!slideBase64 || !slideMime) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    const image = await upscaleSlideImage(slideBase64, slideMime);
    return Response.json({ image });
  } catch (e) {
    console.error("slideboost/upscale error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Upscale failed" },
      { status: 500 },
    );
  }
}
