// app/api/listings/batch/upload-token/route.ts
//
// Issues client-upload tokens so the browser uploads photos DIRECTLY to
// Vercel Blob storage, bypassing the 4.5 MB serverless body limit.
//
// Client flow:
//   1) Call upload(file, { handleUploadUrl: "/api/listings/batch/upload-token" })
//      from @vercel/blob/client
//   2) That helper POSTs metadata here ("blob.generate-client-token") to get a
//      short-lived signed token, then PUTs the file straight to Blob storage
//   3) When the upload finishes, Vercel's infra POSTs back here
//      ("blob.upload-completed") so we could log/persist — we no-op for now
//      since the client tracks the resulting URL.

import { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  const { getSessionUserFromRequest } = await import("@/lib/auth");
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_SIZE,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: user.id }),
      }),
      onUploadCompleted: async () => {
        // No-op. Client tracks the returned blob URL directly.
      },
    });
    return Response.json(json);
  } catch (err) {
    const msg = (err as Error).message || String(err);
    const stack = (err as Error).stack || "";
    const tokenSet = !!process.env.BLOB_READ_WRITE_TOKEN;
    // Single line so it survives Vercel's log truncation in the dashboard.
    console.error(
      `[batch/upload-token] FAIL tokenSet=${tokenSet} msg=${msg} stack=${stack.split("\n")[0]}`
    );
    return Response.json(
      { error: msg, tokenSet, hint: tokenSet ? undefined : "BLOB_READ_WRITE_TOKEN env var is missing" },
      { status: 400 }
    );
  }
}
