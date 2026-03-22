import { writeFile } from "fs/promises";
import path from "path";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json(
        { error: "Invalid file type. Allowed: PNG, JPG, WEBP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: "File too large. Max size: 5MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const outputPath = path.join(
      process.cwd(),
      "public",
      "screenshots",
      `${id}.png`
    );

    await writeFile(outputPath, buffer);

    return Response.json({
      success: true,
      screenshotUrl: `/screenshots/${id}.png?t=${Date.now()}`,
    });
  } catch (error: any) {
    console.error("Screenshot upload error:", error);
    return Response.json(
      { error: "Failed to upload screenshot", details: error.message },
      { status: 500 }
    );
  }
}
