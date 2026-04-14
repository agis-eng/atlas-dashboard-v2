import { put } from "@vercel/blob";
import { NextRequest } from "next/server";

// Vercel serverless body limit — upload one file at a time from the client
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("photos") as File[];

    if (!files.length) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB per file
    const ALLOWED_TYPES = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];

    const urls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // On iOS, type might be empty for HEIC — accept if extension matches
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const typeOk =
        ALLOWED_TYPES.includes(file.type) ||
        ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);

      if (!typeOk) {
        errors.push(
          `${file.name}: Unsupported format (${file.type || ext}). Use JPEG, PNG, WebP, or HEIC.`
        );
        continue;
      }
      if (file.size > MAX_SIZE) {
        errors.push(
          `${file.name}: Too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`
        );
        continue;
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blob = await put(`ebay/${timestamp}-${safeName}`, file, {
        access: "public",
        addRandomSuffix: true,
      });
      urls.push(blob.url);
    }

    return Response.json({ urls, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message, urls: [], errors: [message] }, { status: 500 });
  }
}
