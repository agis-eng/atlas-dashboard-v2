import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const PROJECT_PAGES_PATH = join(process.cwd(), "data", "projectPages.yaml");

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function loadYaml<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch {
    return fallback;
  }
}

function fallbackDraft(project: any, prompt: string) {
  return {
    pageName: `${project.name} Website Draft`,
    headline: `${project.name} — clear, modern, conversion-focused web presence`,
    subheadline: prompt,
    sections: [
      "Hero with clear primary offer and CTA",
      "About / credibility section",
      "Services or programs overview",
      "Testimonials / outcomes section",
      "Contact / booking CTA",
    ],
    cta: "Book a consultation",
    notes: `Generated from prompt: ${prompt}`,
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

    const projectsData = await loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] });
    const project = (projectsData.projects || []).find((item) => item.id === id);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    let draft = fallbackDraft(project, String(prompt).trim());

    if (anthropic) {
      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          messages: [
            {
              role: "user",
              content: `Create a concise website draft for this project.\nProject: ${project.name}\nStage: ${project.stage || "Unknown"}\nStatus: ${project.status || "Unknown"}\nSummary: ${project.summary || "None"}\nPrompt: ${String(prompt).trim()}\n\nReturn strict JSON with keys: pageName, headline, subheadline, sections (array of strings), cta, notes.`,
            },
          ],
        });
        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          draft = { ...draft, ...JSON.parse(jsonMatch[0]) };
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
      name: draft.pageName,
      url: "",
      notes: draft.notes,
      prompt: String(prompt).trim(),
      headline: draft.headline,
      subheadline: draft.subheadline,
      sections: draft.sections,
      cta: draft.cta,
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
