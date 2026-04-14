import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || "";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return Response.json({ error: "Query required" }, { status: 400 });
  }

  try {
    // Use Firecrawl search
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        query: q,
        limit: 8,
      }),
    });

    if (!res.ok) {
      return Response.json({ error: "Search failed" }, { status: 500 });
    }

    const data = await res.json();
    const results = (data.data || []).map((r: any) => ({
      url: r.url,
      title: r.metadata?.title || r.url,
      description: r.metadata?.description || "",
    }));

    return Response.json({ results });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}

// POST - scrape a URL and add it as a document to the brain
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { url, title } = await request.json();

    if (!url) {
      return Response.json({ error: "URL required" }, { status: 400 });
    }

    // Scrape the URL content
    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    if (!scrapeRes.ok) {
      return Response.json({ error: "Failed to scrape URL" }, { status: 500 });
    }

    const scrapeData = await scrapeRes.json();
    const markdown = scrapeData.data?.markdown || "";

    if (!markdown) {
      return Response.json({ error: "No content found at URL" }, { status: 400 });
    }

    const pageTitle = scrapeData.data?.metadata?.title || title || url;

    // Add as document to brain
    const redis = getRedis();
    const existing = (await redis.get(`brains:${user.profile}`)) as { brains: any[] } | null;
    const brains = existing?.brains || [];
    const brainIdx = brains.findIndex((b: any) => b.id === id);

    if (brainIdx < 0) {
      return Response.json({ error: "Brain not found" }, { status: 404 });
    }

    const content = `# ${pageTitle}\n**Source:** ${url}\n\n---\n\n${markdown}`;

    if (!brains[brainIdx].documents) brains[brainIdx].documents = [];
    brains[brainIdx].documents.push({
      name: `${pageTitle.substring(0, 60)}.md`,
      size: content.length,
      type: "text/markdown",
      uploadedAt: new Date().toISOString(),
      content,
    });

    // Also add as link
    if (!brains[brainIdx].links) brains[brainIdx].links = [];
    brains[brainIdx].links.push({
      url,
      title: pageTitle,
      saved: new Date().toISOString(),
    });

    brains[brainIdx].lastUpdated = new Date().toISOString();
    await redis.set(`brains:${user.profile}`, { brains });

    return Response.json({ success: true, title: pageTitle });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to add URL" },
      { status: 500 }
    );
  }
}
