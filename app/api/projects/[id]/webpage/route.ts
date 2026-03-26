import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const PROJECT_PAGES_PATH = join(process.cwd(), "data", "projectPages.yaml");
const CLIENTS_PATH = join(process.cwd(), "data", "clients.yaml");
const SHARED_SKILLS_ROOT = join(process.env.HOME || "", ".openclaw", "skills", "webpage-generator", "references");

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

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
    return await readFile(join(SHARED_SKILLS_ROOT, name), "utf8");
  } catch {
    return "";
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

function pickDesignDirection(project: any, client: any, prompt: string) {
  const blob = `${project?.summary || ""} ${client?.summary || ""} ${client?.notes || ""} ${prompt}`.toLowerCase();
  if (/clinic|health|medical|care|dental|therapy|behavioral/.test(blob)) return "premium service";
  if (/local|service area|phone|contractor|roof|home|plumbing|hvac|landscap/.test(blob)) return "local-trust service";
  if (/ai|automation|software|dashboard|platform|saas|technical|data/.test(blob)) return "modern technical";
  if (/luxury|premium|high-end|exclusive/.test(blob)) return "luxury service";
  return "editorial authority";
}

function fallbackDraft(project: any, client: any, prompt: string) {
  const designDirection = pickDesignDirection(project, client, prompt);
  const audience = client?.name ? `Prospective customers of ${client.name}` : `Prospective customers for ${project.name}`;
  const goal = /book|schedule|consult/i.test(prompt) ? "Drive booked consultations" : "Turn interest into a clear next step";
  const cta = /call|phone/i.test(prompt) ? "Call Now" : /quote|estimate/i.test(prompt) ? "Get a Quote" : "Request a Consultation";

  return {
    pageName: `${project.name} Webpage Draft`,
    concept: `${designDirection} conversion page`,
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
    const { prompt } = await request.json();

    if (!prompt || !String(prompt).trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const [projectsData, clientsData, pagePatterns, antiPatterns, visualMotifs] = await Promise.all([
      loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] }),
      loadYaml<{ clients: any[] }>(CLIENTS_PATH, { clients: [] }),
      loadReference("page-patterns.md"),
      loadReference("anti-patterns.md"),
      loadReference("visual-motifs.md"),
    ]);

    const project = (projectsData.projects || []).find((item) => item.id === id);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const client = project.clientId
      ? (clientsData.clients || []).find((item) => item.id === project.clientId || item.slug === project.clientId)
      : null;

    let draft = fallbackDraft(project, client, String(prompt).trim());

    if (anthropic) {
      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1800,
          messages: [
            {
              role: "user",
              content: `You are generating a high-quality webpage draft from project context. Use the reference material as pattern intelligence, not something to copy literally. Avoid generic SaaS copy and generic three-card layouts.\n\nProject context:\n- Project: ${project.name}\n- Stage: ${project.stage || "Unknown"}\n- Status: ${project.status || "Unknown"}\n- Priority: ${project.priority || "Unknown"}\n- Owner: ${project.owner || "Unknown"}\n- Summary: ${project.summary || "None"}\n- Tags: ${(project.tags || []).join(", ") || "None"}\n- Client: ${client?.name || "None"}\n- Client summary: ${client?.summary || "None"}\n- Client notes: ${client?.notes || "None"}\n- Client contact: ${client?.contact || client?.email || "None"}\n- Request URL: ${client?.requestUrl || "None"}\n\nUser prompt:\n${String(prompt).trim()}\n\nReference: page patterns\n${pagePatterns.slice(0, 3200)}\n\nReference: anti-patterns\n${antiPatterns.slice(0, 2200)}\n\nReference: visual motifs\n${visualMotifs.slice(0, 2200)}\n\nReturn strict JSON with keys:\npageName, concept, audience, goal, designDirection, signatureMove, headline, subheadline, sections (array of strings), trustSignals (array of strings), visualMotifs (array of strings), cta, copyNotes (array of strings), critique (array of strings), notes.\n\nKeep it believable, specific, and useful for implementation.`
            },
          ],
        });

        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const parsed = extractJson(text);
        if (parsed) {
          draft = {
            ...draft,
            ...parsed,
            sections: Array.isArray(parsed.sections) ? parsed.sections : draft.sections,
            trustSignals: Array.isArray(parsed.trustSignals) ? parsed.trustSignals : draft.trustSignals,
            visualMotifs: Array.isArray(parsed.visualMotifs) ? parsed.visualMotifs : draft.visualMotifs,
            copyNotes: Array.isArray(parsed.copyNotes) ? parsed.copyNotes : draft.copyNotes,
            critique: Array.isArray(parsed.critique) ? parsed.critique : draft.critique,
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
      concept: draft.concept,
      audience: draft.audience,
      goal: draft.goal,
      designDirection: draft.designDirection,
      signatureMove: draft.signatureMove,
      headline: draft.headline,
      subheadline: draft.subheadline,
      sections: draft.sections,
      trustSignals: draft.trustSignals,
      visualMotifs: draft.visualMotifs,
      cta: draft.cta,
      copyNotes: draft.copyNotes,
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
