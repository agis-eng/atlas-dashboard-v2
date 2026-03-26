import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

interface YamlProject {
  id: string;
  name: string;
  clientId?: string;
  owner?: string;
  stage?: string;
  status?: string;
  lastUpdate?: string;
  summary?: string;
  previewUrl?: string;
  liveUrl?: string;
  repoUrl?: string;
  rank?: number;
  priority?: string;
  archived?: boolean;
  tags?: string[];
}

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");

async function loadProjectsData(): Promise<{ projects: YamlProject[] }> {
  const fileContents = await readFile(PROJECTS_PATH, "utf8");
  return yaml.load(fileContents, { schema: yaml.JSON_SCHEMA }) as {
    projects: YamlProject[];
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const stage = searchParams.get("stage");

    const data = await loadProjectsData();
    let projects = data.projects || [];

    projects = projects.filter((p) => !p.archived);

    if (owner) {
      projects = projects.filter(
        (p) => p.owner?.toLowerCase() === owner.toLowerCase()
      );
    }
    if (stage) {
      projects = projects.filter(
        (p) => p.stage?.toLowerCase() === stage.toLowerCase()
      );
    }

    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    projects.sort((a, b) => {
      const pa = a.priority ? (priorityOrder[a.priority] ?? 3) : 3;
      const pb = b.priority ? (priorityOrder[b.priority] ?? 3) : 3;
      if (pa !== pb) return pa - pb;

      if (a.rank !== undefined && b.rank !== undefined) {
        return a.rank - b.rank;
      }
      if (a.rank !== undefined) return -1;
      if (b.rank !== undefined) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    return Response.json({ projects });
  } catch (error: any) {
    console.error("Projects API error:", error);
    return Response.json(
      { error: "Failed to load projects", projects: [], details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = (body.name || "").trim();

    if (!name) {
      return Response.json({ error: "Project name is required" }, { status: 400 });
    }

    const data = await loadProjectsData();
    const baseId = `${slugify(body.clientId || name)}-${slugify(name)}`;
    let id = baseId || `project-${Date.now()}`;
    let counter = 2;
    while ((data.projects || []).some((project) => project.id === id)) {
      id = `${baseId}-${counter++}`;
    }

    const project: YamlProject = {
      id,
      name,
      clientId: (body.clientId || "").trim() || undefined,
      owner: (body.owner || "Erik").trim() || "Erik",
      stage: (body.stage || "Lead").trim() || "Lead",
      status: (body.status || "New project").trim() || "New project",
      summary: (body.summary || "").trim() || undefined,
      priority: (body.priority || "medium").trim() || "medium",
      tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],
      lastUpdate: new Date().toISOString().split("T")[0],
      archived: false,
    };

    data.projects = [project, ...(data.projects || [])];

    const yamlStr = yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    });
    await writeFile(PROJECTS_PATH, yamlStr, "utf8");

    return Response.json({ project }, { status: 201 });
  } catch (error: any) {
    console.error("Project create API error:", error);
    return Response.json(
      { error: "Failed to create project", details: error.message },
      { status: 500 }
    );
  }
}
