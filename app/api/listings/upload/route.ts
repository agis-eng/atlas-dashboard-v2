import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB per photo
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic"];

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("photos") as File[];

    if (!files || files.length === 0) {
      return Response.json({ error: "No photos provided" }, { status: 400 });
    }

    if (files.length > 12) {
      return Response.json({ error: "Max 12 photos per listing" }, { status: 400 });
    }

    const listingId = formData.get("listingId") as string || crypto.randomUUID();
    const uploadDir = path.join(process.cwd(), "public", "uploads", "listings", listingId);
    await mkdir(uploadDir, { recursive: true });

    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!ALLOWED_TYPES.includes(file.type)) {
        return Response.json(
          { error: `Invalid file type: ${file.type}. Allowed: PNG, JPG, WEBP, HEIC` },
          { status: 400 }
        );
      }

      if (file.size > MAX_SIZE) {
        return Response.json(
          { error: `File too large: ${file.name}. Max 10MB per photo` },
          { status: 400 }
        );
      }

      const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
      const filename = `${i + 1}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, filename), buffer);
      uploadedUrls.push(`/uploads/listings/${listingId}/${filename}`);
    }

    return Response.json({
      success: true,
      listingId,
      photos: uploadedUrls,
      count: uploadedUrls.length,
    });
  } catch (error: any) {
    console.error("Listing photo upload error:", error);
    return Response.json(
      { error: "Failed to upload photos", details: error.message },
      { status: 500 }
    );
  }
}
