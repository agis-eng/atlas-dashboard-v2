// Client-side photo rotation. Rotates an image 90° clockwise in the browser via
// canvas, stores the rotated JPEG to blob through /api/listings/rotate-photo,
// and returns the new URL. Canvas export also bakes in orientation and strips
// EXIF, so the stored image displays correctly on FB/CL/Mercari.
//
// Requires the source to be CORS-readable (Vercel Blob serves
// access-control-allow-origin: *). A cache-buster forces a fresh CORS-headed
// fetch so a previously cached (non-CORS) response can't taint the canvas.
//
// Large phone photos (e.g. 4032×3024 iPhone shots) can exceed iOS Safari's
// canvas backing-store limit, which makes canvas.toBlob() silently return null.
// We downscale the longest side to MAX_SIDE before export so rotation works on
// mobile and the stored JPEG stays well under the 12MB API cap.
const MAX_SIDE = 2600;

export async function rotatePhoto90(src: string, listingId: string): Promise<string> {
  const img = new window.Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () =>
      reject(new Error("couldn't load the photo (CORS or network)"));
    img.src = src + (src.includes("?") ? "&" : "?") + "cb=" + Date.now();
  });

  // Source dimensions, downscaled to fit MAX_SIDE on the longest edge.
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (!sw || !sh) throw new Error("photo has no dimensions");
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dh; // swap dims for a 90° turn
  canvas.height = dw;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(
              new Error("canvas export failed (photo may be too large for this browser)")
            ),
      "image/jpeg",
      0.9
    )
  );

  const fd = new FormData();
  fd.append("photo", blob, "rotated.jpg");
  fd.append("listingId", listingId);

  const res = await fetch("/api/listings/rotate-photo", {
    method: "POST",
    body: fd,
  });

  // If auth/middleware redirected us to /login, the body is HTML, not JSON.
  // Surface that clearly instead of a generic JSON parse error.
  if (res.redirected || res.url.includes("/login")) {
    throw new Error("session expired — reload and sign in again");
  }
  let data: { url?: string; error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error(`upload failed (HTTP ${res.status})`);
  }
  if (!res.ok || !data.url) throw new Error(data.error || `rotate failed (HTTP ${res.status})`);
  return data.url as string;
}
