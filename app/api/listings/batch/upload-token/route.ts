// app/api/listings/batch/upload-token/route.ts
//
// Issues client-upload tokens so the browser uploads photos DIRECTLY to
// Vercel Blob storage, bypassing the 4.5 MB serverless body limit.
//
// This route handles TWO request types from the @vercel/blob client SDK:
//   1) "blob.generate-client-token" — called by the BROWSER with the user's
//      session cookie. Returns a short-lived signed token for one upload.
//   2) "blob.upload-completed" — called by VERCEL'S INFRA after the upload
//      finishes. Has no session cookie; authenticated by a JWT signed with
//      BLOB_READ_WRITE_TOKEN that handleUpload validates internally.
//
// Auth-checking the second request type rejects the webhook, which leaves
// the browser's upload() promise hanging forever waiting for completion
// confirmation. We only enforce session auth on the token-generation path.

import { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  // Only the token-generation request comes from the user's browser with a
  // session cookie. The upload-completed callback is a server-to-server
  // webhook authenticated by handleUpload's built-in JWT validation.
  let userId: string | undefined;
  if (body.type === "blob.generate-client-token") {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_SIZE,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId }),
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
    console.error(
      `[batch/upload-token] FAIL type=${(body as { type?: string })?.type} tokenSet=${tokenSet} msg=${msg} stack=${stack.split("\n")[0]}`
    );
    return Response.json(
      { error: msg, tokenSet, hint: tokenSet ? undefined : "BLOB_READ_WRITE_TOKEN env var is missing" },
      { status: 400 }
    );
  }
}
