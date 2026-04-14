import { removeNotebookLMLogo } from "@/lib/slideboost/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { base64, mimeType } = await request.json();
    if (!base64 || !mimeType) {
      return Response.json({ error: "Missing base64 or mimeType" }, { status: 400 });
    }
    const image = await removeNotebookLMLogo(base64, mimeType);
    return Response.json({ image });
  } catch (e) {
    console.error("slideboost/remove-notebooklm-logo error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "NotebookLM logo removal failed" },
      { status: 500 },
    );
  }
}
