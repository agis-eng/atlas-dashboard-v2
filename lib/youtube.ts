const TRANSCRIPT_SERVER_URL = process.env.TRANSCRIPT_SERVER_URL || "";

export async function getTranscript(videoId: string): Promise<string | null> {
  // Use the transcript server running on Mac (exposed via Cloudflare tunnel)
  if (TRANSCRIPT_SERVER_URL) {
    try {
      const res = await fetch(
        `${TRANSCRIPT_SERVER_URL}/transcript?videoId=${videoId}`,
        { signal: AbortSignal.timeout(55000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.transcript) return data.transcript;
      }
    } catch {
      // fall through to local fallback
    }
  }

  // Fallback: try yt-dlp locally
  try {
    const { exec } = await import("child_process");
    const { readFile, unlink } = await import("fs/promises");

    const tmpPath = `/tmp/yt-sub-${videoId}-${Date.now()}`;
    const subFile = `${tmpPath}.en.json3`;

    return new Promise((resolve) => {
      exec(
        `yt-dlp --write-auto-sub --sub-lang en --sub-format json3 --skip-download -o "${tmpPath}" "https://www.youtube.com/watch?v=${videoId}"`,
        { timeout: 30000 },
        async (error) => {
          if (error) { resolve(null); return; }
          try {
            const raw = await readFile(subFile, "utf-8");
            const data = JSON.parse(raw);
            const text = (data.events || [])
              .flatMap((ev: any) => (ev.segs || []).map((s: any) => s.utf8 || ""))
              .join("")
              .replace(/\n/g, " ")
              .replace(/\s+/g, " ")
              .trim();
            await unlink(subFile).catch(() => {});
            resolve(text || null);
          } catch {
            await unlink(subFile).catch(() => {});
            resolve(null);
          }
        }
      );
    });
  } catch {
    return null;
  }
}
