import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AtlasDashboard/1.0)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });

    const contentType = res.headers.get("content-type") || "text/html";
    const body = await res.arrayBuffer();

    // Return the response without X-Frame-Options or CSP frame-ancestors
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=60");

    return new Response(body, { status: res.status, headers });
  } catch (err: any) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
