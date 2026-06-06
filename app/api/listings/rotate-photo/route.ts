import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import crypto from "crypto";

const MAX_SIZE = 12 * 1024 * 1024; // 12MB — a re-encoded rotate can exceed the source
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Stores an already-rotated image (rotation happens client-side via canvas) to
// blob storage under a fresh, unique filename and returns the new URL. The
// client then swaps it into the listing's photos array, which persists it.
export async function POST(request: NextRequest) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;
    const listingId = (formData.get("listingId") as string) || crypto.randomUUID();

    if (!file) {
      return Response.json({ error: "No photo provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: `Invalid file type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return Response.json({ error: "File too large. Max 12MB" }, { status: 400 });
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `listings/${listingId}/rot-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.${ext}`;

    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
    });

    return Response.json({ success: true, url: blob.url });
  } catch (error: any) {
    console.error("Rotate-photo upload error:", error);
    return Response.json(
      { error: "Failed to store rotated photo", details: error.message },
      { status: 500 }
    );
  }
}
