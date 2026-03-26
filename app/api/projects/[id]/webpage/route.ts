import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const PROJECT_PAGES_PATH = join(process.cwd(), "data", "projectPages.yaml");
const CLIENTS_PATH = join(process.cwd(), "data", "clients.yaml");
const REPO_REFS_ROOT = join(process.cwd(), "data", "webpage-generator");
const SHARED_SKILLS_ROOT = join(process.env.HOME || "", ".openclaw", "skills", "webpage-generator", "references");

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

type CompetitorResult = {
  title: string;
  url: string;
  snippet?: string;
};

async function loadYaml<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch {
    return fallback;
  }
}

async function loadReference(name: string) {
  try {
    return await readFile(join(REPO_REFS_ROOT, name), "utf8");
  } catch {
    try {
      return await readFile(join(SHARED_SKILLS_ROOT, name), "utf8");
    } catch {
      return "";
    }
  }
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function stripHtml(input: string) {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueByUrl(results: CompetitorResult[]) {
  const seen = new Set<string>();
  return results.filter((item) => {
    try {
      const normalized = new URL(item.url).toString();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    } catch {
      return false;
    }
  });
}

async function searchCompetitors(query: string, limit = 6): Promise<CompetitorResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 AtlasDashboard/1.0",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const html = await res.text();
    const matches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const snippetMatches = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/g)];

    const raw = matches.map((m, i) => {
      let href = m[1] || "";
      try {
        if (href.startsWith("//")) href = `https:${href}`;
        const parsed = new URL(href);
        const uddg = parsed.searchParams.get("uddg");
        if (uddg) href = decodeURIComponent(uddg);
      } catch {
        // leave as-is
      }
      const snippet = stripHtml(snippetMatches[i]?.[1] || snippetMatches[i]?.[2] || "");
      return {
        title: stripHtml(m[2] || ""),
        url: href,
        snippet,
      };
    });

    return uniqueByUrl(raw)
      .filter((item) => /^https?:\/\//.test(item.url))
      .filter((item) => !/dribbble\.com|facebook\.com|instagram\.com|linkedin\.com|yelp\.com|mapquest\.com|yellowpages\.com/i.test(item.url))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function researchCompetitorSafeSecondaryCta(prompt: string) {
  return /call|phone/i.test(prompt) ? "View Services" : /quote|estimate/i.test(prompt) ? "See Pricing Factors" : "See How It Works";
}

function pickDesignDirection(project: any, client: any, prompt: string) {
  const blob = `${project?.summary || ""} ${client?.summary || ""} ${client?.notes || ""} ${prompt}`.toLowerCase();
  if (/clinic|health|medical|care|dental|therapy|behavioral/.test(blob)) return "premium service";
  if (/local|service area|phone|contractor|roof|home|plumbing|hvac|landscap/.test(blob)) return "local-trust service";
  if (/ai|automation|software|dashboard|platform|saas|technical|data/.test(blob)) return "modern technical";
  if (/luxury|premium|high-end|exclusive/.test(blob)) return "luxury service";
  return "editorial authority";
}

function fallbackConcepts(project: any, client: any, prompt: string) {
  const base = pickDesignDirection(project, client, prompt);
  return [
    {
      name: `${base} lead-gen`,
      direction: base,
      signatureMove: "Trust and CTA clustered near the hero",
      headline: `${project.name} with a clearer first-screen offer`,
      whyItCouldWork: "Strong default for conversion-focused pages.",
    },
    {
      name: "editorial authority",
      direction: "editorial authority",
      signatureMove: "Bold typography with a calmer supporting column",
      headline: `A more credible, confident presentation for ${project.name}`,
      whyItCouldWork: "Works when trust and clarity matter more than flashy effects.",
    },
    {
      name: "modern technical",
      direction: "modern technical",
      signatureMove: "Split-panel hero with denser proof framing",
      headline: `${project.name} framed as a sharper modern system`,
      whyItCouldWork: "Good fit for AI, automation, software, and operational products.",
    },
  ];
}

function buildFallbackPageCode(project: any, draft: any) {
  const hero = draft?.pageDraft?.hero || {};
  const services = Array.isArray(draft?.pageDraft?.services) ? draft.pageDraft.services : [];
  const proofItems = Array.isArray(draft?.pageDraft?.proofItems) ? draft.pageDraft.proofItems : [];
  const steps = Array.isArray(draft?.pageDraft?.processSteps) ? draft.pageDraft.processSteps : [];
  const faq = Array.isArray(draft?.pageDraft?.faq) ? draft.pageDraft.faq : [];
  const finalCta = draft?.pageDraft?.finalCta || {};

  return `export default function ${String(project.name || 'Project').replace(/[^a-zA-Z0-9]+/g, '')}LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="max-w-3xl space-y-6">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">${hero.eyebrow || project.stage || 'Trusted service'}</p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">${hero.headline || draft.headline || project.name}</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">${hero.subheadline || draft.subheadline || ''}</p>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-full bg-foreground px-5 py-3 text-background">${hero.primaryCta || draft.cta || 'Get Started'}</button>
            <button className="rounded-full border border-border px-5 py-3">${hero.secondaryCta || 'Learn More'}</button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          ${proofItems.map((item: string) => `<div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">${item}</div>`).join('\n          ')}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="grid gap-6 md:grid-cols-3">
          ${services.map((item: string) => `<div className="rounded-3xl border border-border bg-card p-6"><h3 className="font-medium">${item}</h3></div>`).join('\n          ')}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="space-y-4">
          ${steps.map((item: string, idx: number) => `<div className="flex gap-4 rounded-2xl border border-border p-5"><div className="text-sm text-muted-foreground">0${idx + 1}</div><div>${item}</div></div>`).join('\n          ')}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="space-y-4">
          ${faq.map((item: string) => `<div className="rounded-2xl border border-border p-5">${item}</div>`).join('\n          ')}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="rounded-3xl border border-border bg-card p-8 md:p-12">
          <h2 className="text-3xl font-semibold tracking-tight">${finalCta.headline || `Ready to move forward with ${project.name}?`}</h2>
          <p className="mt-3 text-muted-foreground">${finalCta.reassurance || 'Clear next steps.'}</p>
          <button className="mt-6 rounded-full bg-foreground px-5 py-3 text-background">${finalCta.action || draft.cta || 'Get Started'}</button>
        </div>
      </section>
    </main>
  );
}`;
}

function fallbackDraft(project: any, client: any, prompt: string, competitors: CompetitorResult[] = []) {
  const designDirection = pickDesignDirection(project, client, prompt);
  const audience = client?.name ? `Prospective customers of ${client.name}` : `Prospective customers for ${project.name}`;
  const goal = /book|schedule|consult/i.test(prompt) ? "Drive booked consultations" : "Turn interest into a clear next step";
  const cta = /call|phone/i.test(prompt) ? "Call Now" : /quote|estimate/i.test(prompt) ? "Get a Quote" : "Request a Consultation";

  const concepts = fallbackConcepts(project, client, prompt);

  return {
    pageName: `${project.name} Webpage Draft`,
    concept: `${designDirection} conversion page`,
    concepts,
    recommendedConcept: concepts[0]?.name || designDirection,
    audience,
    goal,
    designDirection,
    signatureMove: designDirection === "modern technical"
      ? "Use a denser proof strip and split-panel hero with system-style framing"
      : designDirection === "local-trust service"
        ? "Put trust markers and contact actions close to the hero"
        : "Use strong typographic hierarchy with one premium proof moment",
    headline: `${project.name} — clear, credible, conversion-focused web presence`,
    subheadline: String(prompt).trim(),
    sections: [
      "Hero with clear offer, trust cue, and primary CTA",
      "Proof block with credibility, outcomes, or differentiators",
      "Services or capability breakdown with concrete language",
      "Process / how it works section",
      "Final CTA with reassurance and next step",
    ],
    sectionCopy: {
      hero: ["Lead with a concrete outcome", "Name who the offer is for", "Place one trust cue near the CTA"],
      proof: ["Use short trust markers", "Highlight outcomes or credentials"],
      services: ["Describe services in plain language", "Pair features with buyer-facing value"],
      process: ["Reduce uncertainty in 3-5 steps", "Keep the flow buyer-friendly"],
      cta: ["Restate value", "Reduce hesitation", "Match CTA wording to the actual next step"],
    },
    trustSignals: [client?.summary, client?.notes, project?.stage, project?.status].filter(Boolean),
    visualMotifs: designDirection === "modern technical"
      ? ["grid accents", "split panels", "compact proof strip"]
      : designDirection === "local-trust service"
        ? ["human proof cards", "contact-first CTA", "approachable imagery blocks"]
        : ["editorial spacing", "refined borders", "calm shadow hierarchy"],
    cta,
    copyNotes: [
      "Lead with concrete value, not vague claims",
      "Bring proof near the first CTA",
      "Keep section headlines outcome-oriented",
    ],
    competitorIdeas: competitors.length
      ? competitors.map((item) => `${item.title} — borrow structural or messaging ideas, not design copies`)
      : [],
    competitorSummary: {
      marketPatterns: competitors.length ? ["Competitors in this niche tend to lead with immediate credibility and a clear service promise", "Proof and reassurance should appear before deep detail", "High-intent pages should surface contact or conversion actions early"] : [],
      trustSignals: competitors.length ? ["Credentials or experience", "Location/service-area clarity", "Testimonials or outcomes"] : [],
      contentIdeas: competitors.length ? ["FAQ covering fit, process, pricing, or timing", "More concrete service breakdowns", "Clearer proof close to the hero"] : [],
      differentiationAngles: ["Use clearer positioning than the market average", "Make the first CTA more specific", "Out-explain vague competitor copy with stronger plain-language value"],
    },
    pageDraft: {
      hero: {
        eyebrow: project.stage || client?.summary || "Trusted service",
        headline: `${project.name} — ${goal}`,
        subheadline: String(prompt).trim(),
        primaryCta: cta,
        secondaryCta: researchCompetitorSafeSecondaryCta(prompt),
      },
      proofItems: [client?.summary, project?.status, project?.stage].filter(Boolean).slice(0, 3),
      services: [
        "Primary service or offer explained in plain language",
        "Differentiator tied to outcomes or experience",
        "Supportive capability or reassurance block",
      ],
      processSteps: ["Start with inquiry", "Review fit / needs", "Deliver service clearly", "Follow through with next steps"],
      faq: ["Who is this for?", "What does the process look like?", "How do I get started?"],
      finalCta: {
        headline: `Ready to move forward with ${project.name}?`,
        action: cta,
        reassurance: "Clear next steps, no vague handoff.",
      },
      componentSuggestions: [
        "Hero with trust strip and CTA cluster",
        "Proof bar or testimonial row",
        "Service cards or capability blocks",
        "Process timeline or step grid",
        "FAQ accordion",
        "Final CTA panel",
      ],
    },
    critique: [
      "Avoid generic three-card feature layouts as the whole page",
      "Ensure the hero communicates who this is for in the first screen",
    ],
    notes: `Generated from project context + prompt: ${String(prompt).trim()}`,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prompt, preferredConcept, competitorQuery, researchCompetitors } = await request.json();

    if (!prompt || !String(prompt).trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const [projectsData, clientsData, pagePatterns, antiPatterns, visualMotifs, patterns21st, sectionCopyFormulas] = await Promise.all([
      loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] }),
      loadYaml<{ clients: any[] }>(CLIENTS_PATH, { clients: [] }),
      loadReference("page-patterns.md"),
      loadReference("anti-patterns.md"),
      loadReference("visual-motifs.md"),
      loadReference("21st-patterns.md"),
      loadReference("section-copy-formulas.md"),
    ]);

    const project = (projectsData.projects || []).find((item) => item.id === id);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const client = project.clientId
      ? (clientsData.clients || []).find((item) => item.id === project.clientId || item.slug === project.clientId)
      : null;

    const preferredConceptName = String(preferredConcept || "").trim();
    const derivedCompetitorQuery = String(competitorQuery || "").trim() || [client?.name, project?.name, project?.summary].filter(Boolean).join(" ");
    const competitorResults = researchCompetitors ? await searchCompetitors(derivedCompetitorQuery, 6) : [];

    let draft: any = fallbackDraft(project, client, String(prompt).trim(), competitorResults);
    if (preferredConceptName) {
      draft.recommendedConcept = preferredConceptName;
    }
    draft.pageCodeDraft = buildFallbackPageCode(project, draft);

    if (anthropic) {
      try {
        const competitorBlock = competitorResults.length
          ? competitorResults.map((item, idx) => `${idx + 1}. ${item.title}\nURL: ${item.url}\nSnippet: ${item.snippet || "None"}`).join("\n\n")
          : "None";

        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2600,
          messages: [
            {
              role: "user",
              content: `You are generating a high-quality webpage draft from project context. Use the reference material as pattern intelligence, not something to copy literally. Avoid generic SaaS copy and generic three-card layouts. If competitor inspiration is present, borrow only structural and messaging ideas that are broadly useful; do not imitate or reproduce any site's unique branding or copy.\n\nProject context:\n- Project: ${project.name}\n- Stage: ${project.stage || "Unknown"}\n- Status: ${project.status || "Unknown"}\n- Priority: ${project.priority || "Unknown"}\n- Owner: ${project.owner || "Unknown"}\n- Summary: ${project.summary || "None"}\n- Tags: ${(project.tags || []).join(", ") || "None"}\n- Client: ${client?.name || "None"}\n- Client summary: ${client?.summary || "None"}\n- Client notes: ${client?.notes || "None"}\n- Client contact: ${client?.contact || client?.email || "None"}\n- Request URL: ${client?.requestUrl || "None"}\n\nUser prompt:\n${String(prompt).trim()}\n\nReference: page patterns\n${pagePatterns.slice(0, 2600)}\n\nReference: anti-patterns\n${antiPatterns.slice(0, 1800)}\n\nReference: visual motifs\n${visualMotifs.slice(0, 1800)}\n\nReference: 21st.dev interaction patterns\n${patterns21st.slice(0, 1800)}\n\nReference: section copy formulas\n${sectionCopyFormulas.slice(0, 1600)}\n\nPreferred concept (if provided, bias the output toward it):\n${preferredConceptName || "None"}\n\nCompetitor inspiration query:\n${derivedCompetitorQuery || "None"}\n\nCompetitor inspiration results:\n${competitorBlock}\n\nReturn strict JSON with keys:\npageName, concept, concepts (array of exactly 3 objects with keys: name, direction, signatureMove, headline, whyItCouldWork), recommendedConcept, audience, goal, designDirection, signatureMove, headline, subheadline, sections (array of strings), sectionCopy (object with keys hero, proof, services, process, cta; each value is an array of strings), trustSignals (array of strings), visualMotifs (array of strings), cta, copyNotes (array of strings), competitorIdeas (array of strings), competitorSummary (object with keys marketPatterns, trustSignals, contentIdeas, differentiationAngles; each value is an array of strings), pageDraft (object with keys hero, proofItems, services, processSteps, faq, finalCta, componentSuggestions), pageCodeDraft (string containing a Next.js/Tailwind page scaffold based on the recommended concept), critique (array of strings), notes.\n\nKeep it believable, specific, and useful for implementation.`
            },
          ],
        });

        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const parsed = extractJson(text);
        if (parsed) {
          draft = {
            ...draft,
            ...parsed,
            concepts: Array.isArray(parsed.concepts) ? parsed.concepts.slice(0, 3) : draft.concepts,
            recommendedConcept: parsed.recommendedConcept || draft.recommendedConcept,
            sections: Array.isArray(parsed.sections) ? parsed.sections : draft.sections,
            trustSignals: Array.isArray(parsed.trustSignals) ? parsed.trustSignals : draft.trustSignals,
            visualMotifs: Array.isArray(parsed.visualMotifs) ? parsed.visualMotifs : draft.visualMotifs,
            copyNotes: Array.isArray(parsed.copyNotes) ? parsed.copyNotes : draft.copyNotes,
            competitorIdeas: Array.isArray(parsed.competitorIdeas) ? parsed.competitorIdeas : draft.competitorIdeas,
            competitorSummary: typeof parsed.competitorSummary === "object" && parsed.competitorSummary ? parsed.competitorSummary : draft.competitorSummary,
            pageDraft: typeof parsed.pageDraft === "object" && parsed.pageDraft ? parsed.pageDraft : draft.pageDraft,
            pageCodeDraft: typeof parsed.pageCodeDraft === "string" && parsed.pageCodeDraft.trim() ? parsed.pageCodeDraft : draft.pageCodeDraft,
            critique: Array.isArray(parsed.critique) ? parsed.critique : draft.critique,
            sectionCopy: typeof parsed.sectionCopy === "object" && parsed.sectionCopy ? parsed.sectionCopy : draft.sectionCopy,
          };
        }
      } catch (error) {
        console.error("Webpage draft AI generation failed, using fallback:", error);
      }
    }

    const pagesData = await loadYaml<{ projectPages: any[] }>(PROJECT_PAGES_PATH, { projectPages: [] });
    const pageId = `proj-${id}-${Date.now()}`;
    const pageRecord = {
      id: pageId,
      projectId: id,
      clientId: project.clientId || "",
      name: draft.pageName,
      url: "",
      prompt: String(prompt).trim(),
      preferredConcept: preferredConceptName,
      competitorQuery: researchCompetitors ? derivedCompetitorQuery : "",
      competitors: competitorResults,
      concept: draft.concept,
      concepts: draft.concepts,
      recommendedConcept: draft.recommendedConcept,
      audience: draft.audience,
      goal: draft.goal,
      designDirection: draft.designDirection,
      signatureMove: draft.signatureMove,
      headline: draft.headline,
      subheadline: draft.subheadline,
      sections: draft.sections,
      sectionCopy: draft.sectionCopy,
      trustSignals: draft.trustSignals,
      visualMotifs: draft.visualMotifs,
      cta: draft.cta,
      copyNotes: draft.copyNotes,
      competitorIdeas: draft.competitorIdeas,
      competitorSummary: draft.competitorSummary,
      pageDraft: draft.pageDraft,
      pageCodeDraft: draft.pageCodeDraft,
      critique: draft.critique,
      notes: draft.notes,
      createdAt: new Date().toISOString(),
    };

    pagesData.projectPages = [pageRecord, ...(pagesData.projectPages || [])];
    await writeFile(
      PROJECT_PAGES_PATH,
      yaml.dump(pagesData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }),
      "utf8"
    );

    if (!project.brain) project.brain = {};
    if (!project.brain.notes) project.brain.notes = [];
    project.brain.notes.unshift(`Website draft created: ${draft.headline}`);
    project.lastUpdate = new Date().toISOString().split("T")[0];

    await writeFile(
      PROJECTS_PATH,
      yaml.dump(projectsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }),
      "utf8"
    );

    return Response.json({ success: true, page: pageRecord, draft });
  } catch (error: any) {
    console.error("Project webpage generation error:", error);
    return Response.json(
      { error: error.message || "Failed to generate webpage draft" },
      { status: 500 }
    );
  }
}
