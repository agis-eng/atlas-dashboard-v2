import { editSlideImage } from "@/lib/slideboost/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { slideBase64, slideMime, instruction, refImageBase64, refImageMime } =
      await request.json();
    if (!slideBase64 || !slideMime || !instruction) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    const image = await editSlideImage(
      slideBase64,
      slideMime,
      instruction,
      refImageBase64,
      refImageMime,
    );
    return Response.json({ image });
  } catch (e) {
    console.error("slideboost/edit-image error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Image edit failed" },
      { status: 500 },
    );
  }
}
