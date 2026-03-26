import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const CLIENTS_PATH = join(process.cwd(), "data", "clients.yaml");
const PROJECT_PAGES_PATH = join(process.cwd(), "data", "projectPages.yaml");
const PROJECT_DECKS_PATH = join(process.cwd(), "data", "projectDecks.yaml");

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

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function fallbackSlides(project: any, deckType: string, prompt: string, selectedSources: any) {
  const title = `${project.name} ${deckType === "pitch-deck" ? "Pitch Deck" : deckType === "client-proposal" ? "Proposal Deck" : "Project Deck"}`;
  const bullets = [
    "Clear problem or opportunity framing",
    "Why this matters now",
    "Simple next-step orientation",
  ];

  return {
    title,
    subtitle: project.summary || prompt,
    audience: deckType === "investor-summary" ? "Investors / partners" : deckType === "client-proposal" ? "Prospective client" : "Internal / stakeholder audience",
    objective: `Use project context to create a ${deckType} with a clear narrative and confident next step.`,
    narrativeArc: [
      "Context and opportunity",
      "What the project is",
      "Why it matters",
      "Proof / traction / differentiation",
      "Next step",
    ],
    chosenSources: Object.entries(selectedSources).filter(([,v]) => !!v).map(([k]) => k),
    theme: {
      style: "dark modern strategic",
      rationale: "Readable, presentation-friendly, and adaptable to sales, investor, and project-update decks.",
    },
    slides: [
      { title: `${project.name}`, purpose: "Open the narrative", bullets: [project.summary || "Project summary", `Stage: ${project.stage || "Unknown"}`, `Status: ${project.status || "Unknown"}`], visualIdea: "Strong title slide with one-line positioning", speakerNotes: "Frame the deck and audience expectation quickly." },
      { title: "The Opportunity", purpose: "Explain the need or problem", bullets, visualIdea: "Before/after or problem/solution framing", speakerNotes: "Why this project deserves attention now." },
      { title: "What We Are Building", purpose: "Define the offering", bullets: ["Core offer or system", "Who it serves", "Why it is distinct"], visualIdea: "Simple capability diagram or architecture strip", speakerNotes: "Keep this concrete and plain-language." },
      { title: "Proof and Signals", purpose: "Establish credibility", bullets: [project.status || "Active work in motion", project.lastUpdate ? `Last update: ${project.lastUpdate}` : "Recent momentum", "Relevant proof points or source-backed signals"], visualIdea: "Proof bar or key-stat slide", speakerNotes: "Pull credibility closer to the middle of the deck." },
      { title: "Execution Plan", purpose: "Show how this moves forward", bullets: ["Priority actions", "Milestones", "Dependencies or asks"], visualIdea: "Timeline or 3-step execution path", speakerNotes: "Make the path feel controlled and realistic." },
      { title: "Next Step", purpose: "Close with action", bullets: ["Decision needed", "Immediate next action", "Desired outcome"], visualIdea: "Clean CTA slide with one strong ask", speakerNotes: "End with a direct, low-friction next step." },
    ],
  };
}

function buildSourceContext(project: any, client: any, latestPage: any, selectedSources: any) {
  const chunks: string[] = [];
  if (selectedSources.projectMeta) {
    chunks.push(`Project meta:\n- Name: ${project.name}\n- Stage: ${project.stage || "Unknown"}\n- Status: ${project.status || "Unknown"}\n- Summary: ${project.summary || "None"}\n- Tags: ${(project.tags || []).join(", ") || "None"}`);
  }
  if (selectedSources.clientInfo && client) {
    chunks.push(`Client info:\n- Name: ${client.name || "None"}\n- Summary: ${client.summary || "None"}\n- Notes: ${client.notes || "None"}\n- Contact: ${client.contact || client.email || "None"}`);
  }
  if (selectedSources.brainNotes) {
    chunks.push(`Brain notes:\n${(project.brain?.notes || []).slice(0, 12).join("\n") || "None"}`);
  }
  if (selectedSources.brainLinks) {
    chunks.push(`Brain links:\n${(project.brain?.links || []).slice(0, 10).map((x: any) => `- ${x.label || x.url}: ${x.url}`).join("\n") || "None"}`);
  }
  if (selectedSources.webpageDraft && latestPage) {
    chunks.push(`Latest webpage draft:\n- Concept: ${latestPage.concept || "None"}\n- Direction: ${latestPage.designDirection || "None"}\n- Headline: ${latestPage.headline || "None"}\n- Sections: ${(latestPage.sections || []).join(" | ") || "None"}`);
  }
  if (selectedSources.competitorInsights && latestPage) {
    chunks.push(`Competitor insights:\n- Ideas: ${(latestPage.competitorIdeas || []).join(" | ") || "None"}\n- Summary: ${JSON.stringify(latestPage.competitorSummary || {})}`);
  }
  if (selectedSources.affiliate && project.affiliate) {
    chunks.push(`Affiliate / commercial notes:\n${JSON.stringify(project.affiliate)}`);
  }
  return chunks.join("\n\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const decksData = await loadYaml<{ projectDecks: any[] }>(PROJECT_DECKS_PATH, { projectDecks: [] });
    const latestDeck = (decksData.projectDecks || []).find((d) => d.projectId === id) || null;
    return Response.json({ deck: latestDeck });
  } catch (error: any) {
    return Response.json({ error: error.message || "Failed to load project deck" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prompt, deckType, selectedSources } = await request.json();

    if (!prompt || !String(prompt).trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const [projectsData, clientsData, pagesData, decksData] = await Promise.all([
      loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] }),
      loadYaml<{ clients: any[] }>(CLIENTS_PATH, { clients: [] }),
      loadYaml<{ projectPages: any[] }>(PROJECT_PAGES_PATH, { projectPages: [] }),
      loadYaml<{ projectDecks: any[] }>(PROJECT_DECKS_PATH, { projectDecks: [] }),
    ]);

    const project = (projectsData.projects || []).find((item) => item.id === id);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    const client = project.clientId ? (clientsData.clients || []).find((item) => item.id === project.clientId || item.slug === project.clientId) : null;
    const latestPage = (pagesData.projectPages || []).find((item) => item.projectId === id) || null;
    const sources = {
      projectMeta: true,
      clientInfo: true,
      brainNotes: true,
      brainLinks: true,
      webpageDraft: true,
      competitorInsights: true,
      affiliate: false,
      ...(selectedSources || {}),
    };

    const sourceContext = buildSourceContext(project, client, latestPage, sources);
    let deck: any = fallbackSlides(project, String(deckType || "project-update"), String(prompt).trim(), sources);

    if (anthropic) {
      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2600,
          messages: [{
            role: "user",
            content: `You are generating a professional presentation deck outline from project context. This is outline-first, not final slide design. Use source material selectively and produce a clean narrative arc similar to a NotebookLM-style deck planner.\n\nDeck type: ${String(deckType || "project-update")}\nUser prompt: ${String(prompt).trim()}\n\nProject source context:\n${sourceContext || "None"}\n\nReturn strict JSON with keys:\ntitle, subtitle, audience, objective, narrativeArc (array of strings), chosenSources (array of strings), theme (object with keys style, rationale), slides (array of 6-12 objects with keys title, purpose, bullets, visualIdea, speakerNotes).\n\nEach slide should have 2-4 concise bullets. Keep it believable and useful.`
          }],
        });

        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const parsed = extractJson(text);
        if (parsed) {
          deck = {
            ...deck,
            ...parsed,
            narrativeArc: Array.isArray(parsed.narrativeArc) ? parsed.narrativeArc : deck.narrativeArc,
            chosenSources: Array.isArray(parsed.chosenSources) ? parsed.chosenSources : deck.chosenSources,
            slides: Array.isArray(parsed.slides) ? parsed.slides.slice(0, 12) : deck.slides,
            theme: typeof parsed.theme === "object" && parsed.theme ? parsed.theme : deck.theme,
          };
        }
      } catch (error) {
        console.error("Deck generation failed, using fallback:", error);
      }
    }

    const record = {
      id: `deck-${id}-${Date.now()}`,
      projectId: id,
      clientId: project.clientId || "",
      deckType: String(deckType || "project-update"),
      prompt: String(prompt).trim(),
      selectedSources: sources,
      title: deck.title,
      subtitle: deck.subtitle,
      audience: deck.audience,
      objective: deck.objective,
      narrativeArc: deck.narrativeArc,
      chosenSources: deck.chosenSources,
      theme: deck.theme,
      slides: deck.slides,
      createdAt: new Date().toISOString(),
    };

    decksData.projectDecks = [record, ...(decksData.projectDecks || [])];
    await writeFile(PROJECT_DECKS_PATH, yaml.dump(decksData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), "utf8");

    if (!project.brain) project.brain = {};
    if (!project.brain.notes) project.brain.notes = [];
    project.brain.notes.unshift(`Deck draft created: ${record.title}`);
    project.lastUpdate = new Date().toISOString().split("T")[0];
    await writeFile(PROJECTS_PATH, yaml.dump(projectsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), "utf8");

    return Response.json({ success: true, deck: record });
  } catch (error: any) {
    console.error("Project deck generation error:", error);
    return Response.json({ error: error.message || "Failed to generate deck" }, { status: 500 });
  }
}
