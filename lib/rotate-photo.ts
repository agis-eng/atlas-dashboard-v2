// Client-side photo rotation. Rotates an image 90° clockwise in the browser via
// canvas, stores the rotated JPEG to blob through /api/listings/rotate-photo,
// and returns the new URL. Canvas export also bakes in orientation and strips
// EXIF, so the stored image displays correctly on FB/CL/Mercari.
//
// Requires the source to be CORS-readable (Vercel Blob serves
// access-control-allow-origin: *). A cache-buster forces a fresh CORS-headed
// fetch so a previously cached (non-CORS) response can't taint the canvas.
export async function rotatePhoto90(src: string, listingId: string): Promise<string> {
  const img = new window.Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src + (src.includes("?") ? "&" : "?") + "cb=" + Date.now();
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalHeight; // swap dims for a 90° turn
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.92
    )
  );

  const fd = new FormData();
  fd.append("photo", blob, "rotated.jpg");
  fd.append("listingId", listingId);
  const res = await fetch("/api/listings/rotate-photo", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok || !data.url) throw new Error(data.error || "rotate failed");
  return data.url as string;
}
