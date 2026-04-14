import { replaceLogo } from "@/lib/slideboost/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { slideBase64, slideMime, logoBase64, logoMime } = await request.json();
    if (!slideBase64 || !slideMime || !logoBase64 || !logoMime) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    const image = await replaceLogo(slideBase64, slideMime, logoBase64, logoMime);
    return Response.json({ image });
  } catch (e) {
    console.error("slideboost/replace-logo error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Logo replacement failed" },
      { status: 500 },
    );
  }
}
