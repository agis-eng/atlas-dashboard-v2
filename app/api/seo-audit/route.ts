import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const REPORTS_PATH = join(process.cwd(), "data", "seoReports.yaml");
const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

type Finding = {
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  issue: string;
  evidence: string;
  fixPrompt: string;
};

async function loadYaml<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch {
    return fallback;
  }
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function stripTags(text: string) {
  return text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAll(re: RegExp, html: string) {
  return [...html.matchAll(re)].map(m => (m[1] || '').trim()).filter(Boolean);
}

function firstMatch(re: RegExp, html: string) {
  const m = html.match(re);
  return m?.[1]?.trim() || '';
}

function scoreToGrade(score: number) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function buildReportHtml(report: any) {
  const colorFor = (score: number) => score >= 85 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  const findingsHtml = (report.findings || []).map((f: Finding) => `
    <div class="finding ${f.priority}">
      <div class="finding-top">
        <span class="pill ${f.priority}">${f.priority.toUpperCase()}</span>
        <span class="category">${f.category}</span>
      </div>
      <h3>${f.issue}</h3>
      <p><strong>Evidence:</strong> ${f.evidence}</p>
      <pre>${f.fixPrompt}</pre>
    </div>
  `).join('');

  const categoryCards = Object.entries(report.categoryScores || {}).map(([k, v]: any) => `
    <div class="card">
      <div class="label">${k}</div>
      <div class="score" style="color:${colorFor(Number(v))}">${v}</div>
    </div>
  `).join('');

  return `<!doctype html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${report.title}</title>
  <style>
    body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#09090f;color:#f4f4f5;margin:0;padding:32px}
    .wrap{max-width:1100px;margin:0 auto}
    .hero,.section,.finding,.card{background:#11111a;border:1px solid #27272a;border-radius:18px}
    .hero{padding:28px;margin-bottom:24px}.section{padding:22px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}
    .grade{font-size:64px;font-weight:800}.muted{color:#a1a1aa}.score{font-size:42px;font-weight:800}.label{color:#a1a1aa;text-transform:capitalize;margin-bottom:8px}
    .finding{padding:18px;margin:14px 0}.finding-top{display:flex;gap:10px;align-items:center;margin-bottom:10px}.pill{font-size:12px;padding:4px 10px;border-radius:999px;font-weight:700}
    .pill.critical{background:#7f1d1d;color:#fecaca}.pill.high{background:#7c2d12;color:#fdba74}.pill.medium{background:#78350f;color:#fde68a}.pill.low{background:#1e3a8a;color:#bfdbfe}
    .category{color:#93c5fd;font-size:12px;text-transform:uppercase;letter-spacing:.08em} pre{white-space:pre-wrap;background:#0b1020;border:1px solid #1f2937;padding:14px;border-radius:12px;color:#d1fae5}
    a{color:#67e8f9}.list{display:grid;gap:10px}
  </style></head><body><div class="wrap">
    <div class="hero">
      <div class="muted">SEO + AISO Audit Report</div>
      <h1>${report.title}</h1>
      <p class="muted">Target: <a href="${report.url}" target="_blank">${report.url}</a></p>
      <div class="grid">
        <div class="card" style="padding:18px"><div class="label">Combined grade</div><div class="grade" style="color:${colorFor(report.combinedScore)}">${report.combinedGrade}</div></div>
        <div class="card" style="padding:18px"><div class="label">Combined score</div><div class="score" style="color:${colorFor(report.combinedScore)}">${report.combinedScore}</div></div>
        <div class="card" style="padding:18px"><div class="label">Traditional SEO</div><div class="score" style="color:${colorFor(report.seoScore)}">${report.seoScore}</div></div>
        <div class="card" style="padding:18px"><div class="label">AISO</div><div class="score" style="color:${colorFor(report.aisoScore)}">${report.aisoScore}</div></div>
      </div>
    </div>
    <div class="section"><h2>Category scores</h2><div class="grid">${categoryCards}</div></div>
    <div class="section"><h2>Executive summary</h2><p>${report.summary}</p></div>
    <div class="section"><h2>Quick wins</h2><div class="list">${(report.quickWins || []).map((x: string) => `<div>• ${x}</div>`).join('')}</div></div>
    <div class="section"><h2>Priority findings + fix prompts</h2>${findingsHtml}</div>
  </div></body></html>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const reportsData = await loadYaml<{ seoReports: any[] }>(REPORTS_PATH, { seoReports: [] });
  if (projectId) {
    return Response.json({ reports: (reportsData.seoReports || []).filter(r => r.projectId === projectId) });
  }
  return Response.json({ reports: reportsData.seoReports || [] });
}

export async function POST(request: Request) {
  try {
    const { url, projectId } = await request.json();
    if (!url || !String(url).trim()) return Response.json({ error: 'URL is required' }, { status: 400 });
    const targetUrl = String(url).trim();
    const base = new URL(targetUrl);

    const [pageRes, robotsRes, llmsRes, sitemapRes] = await Promise.allSettled([
      fetch(targetUrl, { redirect: 'follow', cache: 'no-store', headers: { 'User-Agent': 'Atlas SEO Audit/1.0' } }),
      fetch(new URL('/robots.txt', base), { cache: 'no-store' }),
      fetch(new URL('/llms.txt', base), { cache: 'no-store' }),
      fetch(new URL('/sitemap.xml', base), { cache: 'no-store' }),
    ]);

    if (pageRes.status !== 'fulfilled' || !pageRes.value.ok) {
      return Response.json({ error: 'Failed to fetch target URL' }, { status: 400 });
    }

    const html = await pageRes.value.text();
    const text = stripTags(html).slice(0, 6000);
    const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
    const metaDescription = firstMatch(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html);
    const h1s = matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, html).map(stripTags);
    const h2s = matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, html).map(stripTags);
    const canonicals = matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi, html);
    const jsonLdCount = (html.match(/application\/ld\+json/gi) || []).length;
    const faqSignals = /faq|frequently asked questions/i.test(html);
    const schemaSignals = jsonLdCount > 0;
    const conversationalSignals = /how to|what is|why|faq|questions/i.test(text.toLowerCase());
    const freshnessSignals = /202[4-6]|updated|last modified|published/i.test(html.toLowerCase());
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const imageAltMissingApprox = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
    const internalLinks = matchAll(/<a[^>]+href=["']([^"']+)["']/gi, html).filter(h => h.startsWith('/') || h.includes(base.hostname)).length;
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    const categoryScores: Record<string, number> = {
      metadata: 100,
      headings: 100,
      technicalSeo: 100,
      mobile: 100,
      schema: 100,
      contentStructure: 100,
      eeat: 70,
      llmsTxt: 100,
      freshness: 100,
      conversationalOptimization: 100,
    };
    const findings: Finding[] = [];

    const addFinding = (f: Finding, penalty: number) => {
      findings.push(f);
      categoryScores[f.category] = Math.max(0, (categoryScores[f.category] ?? 100) - penalty);
    };

    if (!title) addFinding({ category: 'metadata', priority: 'critical', issue: 'Missing title tag', evidence: 'No <title> tag found.', fixPrompt: 'Add a unique <title> tag that clearly names the page, primary topic, and brand within ~50-60 characters.' }, 40);
    if (title && title.length > 65) addFinding({ category: 'metadata', priority: 'medium', issue: 'Title tag too long', evidence: `Current title length: ${title.length}`, fixPrompt: `Rewrite the title to ~50-60 characters while keeping the primary keyword and brand. Current title: ${title}` }, 12);
    if (!metaDescription) addFinding({ category: 'metadata', priority: 'high', issue: 'Missing meta description', evidence: 'No meta description found.', fixPrompt: 'Write a 140-160 character meta description with a clear value proposition and strong click incentive.' }, 25);
    if (h1s.length === 0) addFinding({ category: 'headings', priority: 'critical', issue: 'Missing H1', evidence: 'No H1 found on page.', fixPrompt: 'Add one clear H1 that matches the page intent and primary topic.' }, 35);
    if (h1s.length > 1) addFinding({ category: 'headings', priority: 'medium', issue: 'Multiple H1s', evidence: `${h1s.length} H1 tags found.`, fixPrompt: 'Consolidate to one primary H1 and convert secondary heading(s) to H2/H3 as appropriate.' }, 15);
    if (!canonicals.length) addFinding({ category: 'technicalSeo', priority: 'medium', issue: 'Missing canonical tag', evidence: 'No canonical link tag found.', fixPrompt: 'Add a canonical tag pointing to the preferred URL for this page.' }, 12);
    if (!hasViewport) addFinding({ category: 'mobile', priority: 'high', issue: 'Missing viewport meta tag', evidence: 'No responsive viewport meta tag detected.', fixPrompt: 'Add <meta name="viewport" content="width=device-width, initial-scale=1" /> to improve mobile rendering.' }, 25);
    if (!schemaSignals) addFinding({ category: 'schema', priority: 'high', issue: 'No structured data detected', evidence: 'No JSON-LD scripts found.', fixPrompt: 'Add JSON-LD schema relevant to the page type (Organization, LocalBusiness, FAQPage, Article, Service, BreadcrumbList, etc.).' }, 25);
    if (wordCount < 250) addFinding({ category: 'contentStructure', priority: 'high', issue: 'Thin content', evidence: `Approximate word count is ${wordCount}.`, fixPrompt: 'Expand the page with clearer explanations, supporting details, FAQs, proof, and intent-matching subtopics.' }, 22);
    if (internalLinks < 3) addFinding({ category: 'technicalSeo', priority: 'medium', issue: 'Weak internal linking', evidence: `Only ${internalLinks} internal links detected.`, fixPrompt: 'Add contextual internal links to closely related pages, services, resources, and trust-building content.' }, 10);
    if (imageAltMissingApprox > 0) addFinding({ category: 'mobile', priority: 'medium', issue: 'Images missing alt text', evidence: `Approximately ${imageAltMissingApprox} image(s) missing alt attributes.`, fixPrompt: 'Add concise, descriptive alt text to informative images. Leave decorative images with empty alt attributes.' }, 10);
    if (llmsRes.status !== 'fulfilled' || !llmsRes.value.ok) addFinding({ category: 'llmsTxt', priority: 'medium', issue: 'llms.txt missing', evidence: 'No llms.txt file found at /llms.txt.', fixPrompt: 'Create an llms.txt file summarizing the site, important URLs, key entities, and preferred pages for AI systems to cite.' }, 18);
    if (!freshnessSignals) addFinding({ category: 'freshness', priority: 'medium', issue: 'Weak freshness signals', evidence: 'No obvious updated/published/freshness cues detected.', fixPrompt: 'Add visible updated dates, revision notes, or freshness cues where appropriate, especially on important evergreen pages.' }, 14);
    if (!conversationalSignals) addFinding({ category: 'conversationalOptimization', priority: 'medium', issue: 'Weak conversational query coverage', evidence: 'Limited question/answer or conversational phrasing detected.', fixPrompt: 'Add FAQ-style headings and direct answer blocks that match real user questions and AI query patterns.' }, 14);
    if (!faqSignals) addFinding({ category: 'conversationalOptimization', priority: 'low', issue: 'FAQ/answer blocks absent', evidence: 'No obvious FAQ-like section found.', fixPrompt: 'Add a short FAQ or direct-answer section for high-intent questions users and AI systems may ask.' }, 8);
    if (robotsRes.status !== 'fulfilled' || !robotsRes.value.ok) addFinding({ category: 'technicalSeo', priority: 'medium', issue: 'robots.txt missing or inaccessible', evidence: 'robots.txt could not be fetched successfully.', fixPrompt: 'Publish a valid robots.txt and make sure it does not accidentally block important pages.' }, 10);
    if (sitemapRes.status !== 'fulfilled' || !sitemapRes.value.ok) addFinding({ category: 'technicalSeo', priority: 'medium', issue: 'sitemap.xml missing or inaccessible', evidence: 'sitemap.xml could not be fetched successfully.', fixPrompt: 'Publish a sitemap.xml and reference it from robots.txt.' }, 10);

    const seoScore = Math.round((categoryScores.metadata + categoryScores.headings + categoryScores.technicalSeo + categoryScores.mobile + categoryScores.schema) / 5);
    const aisoScore = Math.round((categoryScores.schema + categoryScores.contentStructure + categoryScores.eeat + categoryScores.llmsTxt + categoryScores.freshness + categoryScores.conversationalOptimization) / 6);
    const combinedScore = Math.round((seoScore + aisoScore) / 2);

    let summary = `This site scores ${combinedScore}/100 overall, with stronger areas and priority issues across both classic SEO and AI-search readiness.`;
    let quickWins = findings.slice(0, 5).map(f => f.issue);

    if (anthropic) {
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2200,
          messages: [{ role: 'user', content: `You are Herald, a professional SEO and AISO consultant. Analyze this website evidence and return strict JSON with keys: summary, quickWins (array of strings), findings (array of objects with keys category, priority, issue, evidence, fixPrompt). Keep findings concrete and implementation-ready.\n\nURL: ${targetUrl}\nTitle: ${title || 'None'}\nMeta description: ${metaDescription || 'None'}\nH1s: ${h1s.join(' | ') || 'None'}\nH2s: ${h2s.slice(0, 12).join(' | ') || 'None'}\nCanonical: ${canonicals[0] || 'None'}\nWord count: ${wordCount}\nInternal links: ${internalLinks}\nJSON-LD scripts: ${jsonLdCount}\nHas viewport: ${hasViewport}\nMissing alt approx: ${imageAltMissingApprox}\nRobots ok: ${robotsRes.status === 'fulfilled' && robotsRes.value.ok}\nSitemap ok: ${sitemapRes.status === 'fulfilled' && sitemapRes.value.ok}\nllms.txt ok: ${llmsRes.status === 'fulfilled' && llmsRes.value.ok}\nFreshness signals: ${freshnessSignals}\nConversational signals: ${conversationalSignals}\nText sample: ${text}\n\nExisting heuristic findings: ${JSON.stringify(findings)}` }],
        });
        const parsed = extractJson(msg.content[0]?.type === 'text' ? msg.content[0].text : '');
        if (parsed) {
          if (typeof parsed.summary === 'string') summary = parsed.summary;
          if (Array.isArray(parsed.quickWins)) quickWins = parsed.quickWins;
          if (Array.isArray(parsed.findings) && parsed.findings.length) {
            // merge heuristic + llm, favor llm additions but keep unique issue names
            const seen = new Set<string>();
            const merged = [...findings, ...parsed.findings].filter((f: any) => {
              const key = `${f.category}|${f.issue}`;
              if (seen.has(key)) return false;
              seen.add(key); return true;
            });
            findings.length = 0; findings.push(...merged);
          }
        }
      } catch {}
    }

    const reportsData = await loadYaml<{ seoReports: any[] }>(REPORTS_PATH, { seoReports: [] });
    const projectsData = await loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] });
    const id = `seo-${Date.now()}`;
    const report = {
      id,
      projectId: projectId || '',
      url: targetUrl,
      title: `${base.hostname} SEO + AISO Audit`,
      seoScore,
      aisoScore,
      combinedScore,
      combinedGrade: scoreToGrade(combinedScore),
      categoryScores,
      summary,
      quickWins,
      findings: findings.sort((a, b) => ({critical:0, high:1, medium:2, low:3}[a.priority] - {critical:0, high:1, medium:2, low:3}[b.priority])),
      reportHtml: '',
      createdAt: new Date().toISOString(),
      shareUrl: '',
    };
    report.reportHtml = buildReportHtml(report);
    report.shareUrl = `/seo-reports/${id}`;

    reportsData.seoReports = [report, ...(reportsData.seoReports || [])];
    await writeFile(REPORTS_PATH, yaml.dump(reportsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), 'utf8');

    if (projectId) {
      const p = (projectsData.projects || []).find((x: any) => x.id === projectId);
      if (p) {
        p.lastUpdate = new Date().toISOString().split('T')[0];
        p.brain = p.brain || {};
        p.brain.notes = p.brain.notes || [];
        p.brain.notes.unshift(`SEO audit created: ${base.hostname} (${combinedScore}/100)`);
        await writeFile(PROJECTS_PATH, yaml.dump(projectsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), 'utf8');
      }
    }

    return Response.json({ success: true, report, reportUrl: `/seo-reports/${id}` });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Failed to generate SEO audit' }, { status: 500 });
  }
}
