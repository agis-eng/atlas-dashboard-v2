import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { getProjectDetails, getTasks } from "@/lib/data";
import { enrichVoiceContext } from "@/lib/voice-context-server";
import { sanitizeVoiceContext, type VoiceContext } from "@/lib/voice-context";

const PIPECAT_BASE_URL = process.env.NEXT_PUBLIC_PIPECAT_WEBRTC_URL?.trim() || "";

type StoredProjectPage = {
  id?: string;
  name?: string;
  url?: string;
  notes?: string;
};

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function clip(value: string | undefined | null, max: number) {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return stripHtml(match?.[1] || "");
}

function extractTags(html: string, pattern: RegExp, limit: number) {
  const matches = Array.from(html.matchAll(pattern))
    .map((match) => stripHtml(match[1] || ""))
    .filter(Boolean);

  return matches.slice(0, limit);
}

async function fetchHtml(target: string) {
  const response = await fetch(target, {
    headers: {
      "user-agent": "AtlasDashboardVoice/1.0 (+https://atlas-dashboard-v2-production.up.railway.app)",
      accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!response.ok) return null;
  return response.text();
}

async function loadStoredProjectPages(): Promise<StoredProjectPage[]> {
  try {
    const filePath = join(process.cwd(), "data", "projectPages.yaml");
    const contents = await readFile(filePath, "utf8");
    const data = yaml.load(contents) as { projectPages?: StoredProjectPage[] };
    return data.projectPages || [];
  } catch {
    return [];
  }
}

function sameOriginUrl(target: string, baseUrl: string) {
  try {
    const url = new URL(target, baseUrl);
    const base = new URL(baseUrl);
    return url.origin === base.origin ? url : null;
  } catch {
    return null;
  }
}

async function fetchSitemapUrls(baseUrl: string) {
  try {
    const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();
    const xml = await fetchHtml(sitemapUrl);
    if (!xml) return [];

    const urls = Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
      .map((match) => String(match[1] || "").trim())
      .map((candidate) => sameOriginUrl(candidate, baseUrl)?.toString() || "")
      .filter(Boolean)
      .filter((candidate) => !/\/wp-json|\/feed|\/tag\//i.test(candidate));

    return Array.from(new Set(urls)).slice(0, 8);
  } catch {
    return [];
  }
}

function extractCandidateLinks(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const matches = Array.from(
    html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
  );

  const candidates = new Set<string>();
  for (const match of matches) {
    const href = String(match[1] || "").trim();
    const label = stripHtml(match[2] || "").toLowerCase();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) {
      continue;
    }

    const absolute = new URL(href, base).toString();
    const absoluteUrl = new URL(absolute);
    if (absoluteUrl.origin !== base.origin) continue;

    const pathBlob = `${absoluteUrl.pathname} ${label}`.toLowerCase();
    if (/(contact|about|team|get-in-touch|schedule|book|location|reach|service|pricing|faq|apply|quote|insurance|benefit)/.test(pathBlob)) {
      candidates.add(absolute);
    }
  }

  return Array.from(candidates).slice(0, 5);
}

function buildPageSnapshot(label: string, html: string) {
  const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = extractTag(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
  );
  const h1s = extractTags(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi, 3);
  const h2s = extractTags(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi, 5);
  const emails = Array.from(new Set(html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])).slice(0, 3);
  const phones = Array.from(
    new Set(html.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g) || [])
  ).slice(0, 3);
  const text = clip(stripHtml(html), 700);

  const parts = [
    `${label}:`,
    title ? `Title: ${title}` : null,
    metaDescription ? `Meta description: ${metaDescription}` : null,
    h1s.length ? `H1s: ${h1s.join(" | ")}` : null,
    h2s.length ? `H2s: ${h2s.join(" | ")}` : null,
    emails.length ? `Emails: ${emails.join(" | ")}` : null,
    phones.length ? `Phones: ${phones.join(" | ")}` : null,
    text ? `Visible text excerpt: ${text}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join("\n");
}

async function fetchSiteSnapshot(url?: string | null) {
  const target = String(url || "").trim();
  if (!target || !/^https?:\/\//i.test(target)) return null;

  try {
    const homepageHtml = await fetchHtml(target);
    if (!homepageHtml) return null;

    const homepageCandidates = extractCandidateLinks(homepageHtml, target);
    const sitemapUrls = await fetchSitemapUrls(target);
    const candidateUrls = Array.from(new Set([...homepageCandidates, ...sitemapUrls])).slice(0, 5);
    const extraPages = await Promise.all(
      candidateUrls.map(async (candidateUrl, index) => {
        try {
          const html = await fetchHtml(candidateUrl);
          return html
            ? buildPageSnapshot(index === 0 ? "Related page" : `Related page ${index + 1}`, html)
            : null;
        } catch {
          return null;
        }
      })
    );

    return [
      buildPageSnapshot("Homepage", homepageHtml),
      ...extraPages.filter((value): value is string => Boolean(value)),
    ].join("\n\n");
  } catch {
    return null;
  }
}

async function fetchBrainLinkSnapshots(links: Array<{ url?: string; label?: string }>) {
  const httpLinks = links
    .map((link) => ({
      label: clip(link.label || link.url || "", 80),
      url: String(link.url || "").trim(),
    }))
    .filter((link) => /^https?:\/\//i.test(link.url))
    .slice(0, 4);

  const snapshots = await Promise.all(
    httpLinks.map(async (link, index) => {
      try {
        const html = await fetchHtml(link.url);
        if (!html) return null;
        return buildPageSnapshot(`Brain link ${index + 1}${link.label ? ` (${link.label})` : ""}`, html);
      } catch {
        return null;
      }
    })
  );

  return snapshots.filter((value): value is string => Boolean(value));
}

async function hydrateProjectContext(context: VoiceContext | null) {
  const enriched = await enrichVoiceContext(context);
  if (!enriched?.projectId) return enriched;

  const project = await getProjectDetails({ project_id: enriched.projectId });
  if (!project) return enriched;

  const [tasks, siteSnapshot, storedPages] = await Promise.all([
    getTasks({ project: project.id }),
    fetchSiteSnapshot(project.liveUrl || project.previewUrl || null),
    loadStoredProjectPages(),
  ]);

  const topTasks = tasks
    .filter((task) => (task.status || "").toLowerCase() !== "completed")
    .slice(0, 4)
    .map(
      (task) =>
        `${task.title}${task.status ? ` (${task.status})` : ""}${task.priority ? ` [${task.priority}]` : ""}`
    );

  const brainNotes = ((project as any).brain?.notes || [])
    .map((note: unknown) => clip(String(note || ""), 180))
    .filter(Boolean)
    .slice(0, 4);

  const brainLinks = ((project as any).brain?.links || [])
    .map((link: any) => {
      const label = clip(link?.label || link?.url || "", 80);
      const url = clip(link?.url || "", 140);
      return label && url ? `${label}: ${url}` : label || url;
    })
    .filter(Boolean)
    .slice(0, 4);

  const matchingStoredPages = storedPages
    .filter((page) => {
      const pageUrl = String(page.url || "").trim();
      return (
        (page.name && page.name.toLowerCase() === project.name.toLowerCase()) ||
        (pageUrl && (pageUrl === project.liveUrl || pageUrl === project.previewUrl))
      );
    })
    .slice(0, 3)
    .map((page) => {
      const title = clip(page.name || page.url || "Stored page", 80);
      const notes = clip(page.notes || "", 280);
      return notes ? `${title}: ${notes}` : title;
    });

  const brainLinkSnapshots = await fetchBrainLinkSnapshots(((project as any).brain?.links || []) as Array<{ url?: string; label?: string }>);

  const summaryParts = [
    enriched.contextSummary,
    project.summary ? `Project summary: ${clip(project.summary, 180)}` : null,
    project.liveUrl ? `Live site: ${project.liveUrl}` : null,
    project.previewUrl && project.previewUrl !== project.liveUrl
      ? `Preview site: ${project.previewUrl}`
      : null,
    project.repoUrl ? `Repo: ${project.repoUrl}` : null,
    topTasks.length ? `Priority tasks: ${topTasks.join("; ")}` : null,
    matchingStoredPages[0] ? `Stored page notes: ${matchingStoredPages[0]}` : null,
  ].filter((value): value is string => Boolean(value));

  const hints = [
    ...(enriched.contextHints || []),
    project.liveUrl ? `Live URL: ${project.liveUrl}` : null,
    project.repoUrl ? `Repo URL: ${project.repoUrl}` : null,
    topTasks[0] ? `Top task: ${clip(topTasks[0], 140)}` : null,
    brainNotes[0] ? `Brain note: ${clip(brainNotes[0], 140)}` : null,
    matchingStoredPages[0] ? `Stored project page notes loaded` : null,
    brainLinkSnapshots[0] ? `Brain link content loaded` : null,
    siteSnapshot ? `Multi-page site snapshot loaded` : null,
  ].filter((value): value is string => Boolean(value));

  const knowledgeBlocks = [
    `Project: ${project.name}`,
    project.owner ? `Owner: ${project.owner}` : null,
    project.stage ? `Stage: ${project.stage}` : null,
    project.status ? `Status: ${project.status}` : null,
    project.summary ? `Project summary: ${clip(project.summary, 300)}` : null,
    project.repoUrl ? `Repository: ${project.repoUrl}` : null,
    project.liveUrl ? `Live site: ${project.liveUrl}` : null,
    project.previewUrl && project.previewUrl !== project.liveUrl
      ? `Preview URL: ${project.previewUrl}`
      : null,
    topTasks.length ? `Open tasks:\n- ${topTasks.join("\n- ")}` : null,
    brainNotes.length ? `Brain notes:\n- ${brainNotes.join("\n- ")}` : null,
    brainLinks.length ? `Brain links:\n- ${brainLinks.join("\n- ")}` : null,
    matchingStoredPages.length ? `Stored project pages:\n- ${matchingStoredPages.join("\n- ")}` : null,
    brainLinkSnapshots.length ? `Brain link snapshots:\n${brainLinkSnapshots.join("\n\n")}` : null,
    siteSnapshot ? `Live site snapshot:\n${siteSnapshot}` : null,
  ].filter((value): value is string => Boolean(value));

  return sanitizeVoiceContext({
    ...enriched,
    contextSummary: clip(summaryParts.join(" "), 600),
    contextHints: hints,
    messageText: clip(knowledgeBlocks.join("\n\n"), 2000),
  });
}

export async function POST(request: Request) {
  try {
    if (!PIPECAT_BASE_URL) {
      return NextResponse.json(
        { error: "Voice service URL is not configured." },
        { status: 500 }
      );
    }

    const baseUrl = normalizeBaseUrl(PIPECAT_BASE_URL);
    const body = await request.json().catch(() => ({}));
    const rawContext = body?.context
      ? sanitizeVoiceContext(body.context as VoiceContext)
      : null;
    const context = await hydrateProjectContext(rawContext);

    const startUrl = `${baseUrl}/start`;
    const upstream = await fetch(startUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        createDailyRoom: true,
        dailyRoomProperties: {
          start_video_off: true,
          enable_prejoin_ui: false,
          enable_chat: false,
          enable_emoji_reactions: false,
          max_participants: 2,
          enable_people_ui: false,
          enable_network_ui: false,
          enable_screenshare: false,
        },
        dailyMeetingTokenProperties: {
          start_video_off: true,
          start_audio_off: false,
          enable_prejoin_ui: false,
          enable_screenshare: false,
          user_name: context?.projectName
            ? `Erik · ${context.projectName}`
            : "Erik",
        },
        body: {
          atlasContext: context,
        },
      }),
      cache: "no-store",
    });

    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok || !payload?.dailyRoom) {
      return NextResponse.json(
        {
          error:
            payload?.error ||
            payload?.detail ||
            "Voice service failed to create a Daily session.",
          status: upstream.status,
        },
        { status: upstream.ok ? 502 : upstream.status }
      );
    }

    return NextResponse.json({
      provider: "daily",
      launchUrl: payload.dailyRoom,
      sessionId: payload.sessionId || null,
    });
  } catch (error: any) {
    console.error("Voice session route error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create voice session." },
      { status: 500 }
    );
  }
}
