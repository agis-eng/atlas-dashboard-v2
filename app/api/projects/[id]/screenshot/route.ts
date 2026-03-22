import { captureProjectScreenshot } from "@/lib/screenshot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { url } = await request.json();

    if (!url) {
      return Response.json({ error: "URL required" }, { status: 400 });
    }

    // Capture screenshot
    const success = await captureProjectScreenshot(id, url);

    if (success) {
      return Response.json({ success: true, screenshotUrl: `/screenshots/${id}.png?t=${Date.now()}` });
    } else {
      return Response.json({ error: "Failed to capture screenshot" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Screenshot API error:", error);
    return Response.json(
      { error: "Failed to capture screenshot", details: error.message },
      { status: 500 }
    );
  }
}
