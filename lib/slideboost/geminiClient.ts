// Browser-side wrapper. Same function signatures as the original
// services/geminiService.ts but proxies through Next API routes so the
// Gemini API key never leaves the server.

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function editSlideImage(
  slideBase64: string,
  slideMime: string,
  instruction: string,
  refImageBase64?: string,
  refImageMime?: string,
): Promise<string> {
  const { image } = await postJSON<{ image: string }>(
    "/api/slideboost/edit-image",
    { slideBase64, slideMime, instruction, refImageBase64, refImageMime },
  );
  return image;
}

export async function upscaleSlideImage(
  slideBase64: string,
  slideMime: string,
): Promise<string> {
  const { image } = await postJSON<{ image: string }>(
    "/api/slideboost/upscale",
    { slideBase64, slideMime },
  );
  return image;
}

export async function replaceLogo(
  slideBase64: string,
  slideMime: string,
  logoBase64: string,
  logoMime: string,
): Promise<string> {
  const { image } = await postJSON<{ image: string }>(
    "/api/slideboost/replace-logo",
    { slideBase64, slideMime, logoBase64, logoMime },
  );
  return image;
}

export async function removeNotebookLMLogo(
  base64WithPrefix: string,
  mimeType: string,
): Promise<string> {
  const { image } = await postJSON<{ image: string }>(
    "/api/slideboost/remove-notebooklm-logo",
    { base64: base64WithPrefix, mimeType },
  );
  return image;
}

export async function removeWatermark(
  base64WithPrefix: string,
  mimeType: string,
): Promise<string> {
  const { image } = await postJSON<{ image: string }>(
    "/api/slideboost/remove-watermark",
    { base64: base64WithPrefix, mimeType },
  );
  return image;
}

export async function analyzeAndReviseSlide(
  base64WithPrefix: string,
  mimeType: string,
  userInstruction?: string,
  logoBase64WithPrefix?: string,
  logoMimeType?: string,
): Promise<{
  extractedText: string;
  suggestedRevision: string;
  improvements: string[];
}> {
  return postJSON("/api/slideboost/analyze", {
    base64: base64WithPrefix,
    mimeType,
    instruction: userInstruction,
    logoBase64: logoBase64WithPrefix,
    logoMimeType,
  });
}
