// app/api/listings/batch/upload/route.ts
import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import crypto from "crypto";
import sharp from "sharp";
import exifr from "exifr";

export const maxDuration = 300;

const MAX_SIZE = 15 * 1024 * 1024; // 15MB per photo
const MAX_FILES = 100;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];

interface UploadedPhoto {
  photoId: string;
  blobUrl: string;
  originalName: string;
  exifTimestampMs: number | null;
  sizeBytes: number;
}

async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  // Vercel's runtime includes libvips with HEIF, so sharp handles HEIC natively.
  return await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
}

async function extractExifTimestamp(buffer: Buffer): Promise<number | null> {
  try {
    const exif = await exifr.parse(buffer, ["DateTimeOriginal"]);
    if (exif?.DateTimeOriginal instanceof Date) {
      return exif.DateTimeOriginal.getTime();
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("photos") as File[];
    const batchId = (formData.get("batchId") as string) || crypto.randomUUID();

    if (!files || files.length === 0) {
      return Response.json({ error: "No photos provided" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return Response.json({ error: `Max ${MAX_FILES} photos per batch` }, { status: 400 });
    }

    const photos: UploadedPhoto[] = [];
    const skippedReasons: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerType = (file.type || "").toLowerCase();

      if (!ALLOWED_TYPES.includes(lowerType)) {
        skippedReasons.push(`${file.name}: unsupported type ${file.type}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        skippedReasons.push(`${file.name}: too large (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
        continue;
      }

      try {
        const originalBuffer = Buffer.from(await file.arrayBuffer());

        // EXIF read from the original buffer (works for HEIC and JPEG)
        const exifTimestampMs = await extractExifTimestamp(originalBuffer);

        // Convert HEIC → JPEG; pass through others
        const isHeic = lowerType === "image/heic" || lowerType === "image/heif";
        const jpegBuffer = isHeic ? await heicToJpeg(originalBuffer) : originalBuffer;
        const ext = isHeic ? "jpg" : (lowerType.split("/")[1] === "jpeg" ? "jpg" : lowerType.split("/")[1]);

        const blob = await put(`listings/batch/${batchId}/${i + 1}.${ext}`, jpegBuffer, {
          access: "public",
          contentType: isHeic ? "image/jpeg" : lowerType,
        });

        photos.push({
          photoId: crypto.randomUUID(),
          blobUrl: blob.url,
          originalName: file.name,
          exifTimestampMs,
          sizeBytes: jpegBuffer.length,
        });
      } catch (err) {
        skippedReasons.push(`${file.name}: ${(err as Error).message}`);
      }
    }

    return Response.json({
      batchId,
      photos,
      uploadedCount: photos.length,
      skippedCount: skippedReasons.length,
      skippedReasons,
    });
  } catch (err) {
    console.error("[batch/upload] error", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
