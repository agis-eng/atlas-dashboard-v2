import { mkdir, writeFile } from "fs/promises";
import { join, extname } from "path";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const files = formData.getAll("files").filter(Boolean) as File[];

    if (!files.length) {
      return Response.json({ error: "No files uploaded" }, { status: 400 });
    }

    const uploadDir = join(process.cwd(), "public", "webpage-inspiration", id);
    await mkdir(uploadDir, { recursive: true });

    const urls: string[] = [];

    for (const file of files.slice(0, 8)) {
      const type = String(file.type || "");
      if (!type.startsWith("image/")) continue;
      if (file.size > 8 * 1024 * 1024) {
        return Response.json({ error: `File too large: ${file.name}` }, { status: 400 });
      }

      const ext = extname(file.name) || (type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg");
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name.replace(extname(file.name), ""))}${ext}`;
      const outputPath = join(uploadDir, filename);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(outputPath, bytes);
      urls.push(`/webpage-inspiration/${id}/${filename}`);
    }

    return Response.json({ success: true, urls });
  } catch (error: any) {
    console.error("Webpage inspiration upload failed:", error);
    return Response.json(
      { error: error.message || "Failed to upload inspiration images" },
      { status: 500 }
    );
  }
}
