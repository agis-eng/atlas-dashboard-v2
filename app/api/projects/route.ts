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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const stage = searchParams.get("stage");

    // Read from data directory (bundled with deployment)
    const projectsPath = join(process.cwd(), "data", "projects.yaml");
    const fileContents = await readFile(projectsPath, "utf8");
    const data = yaml.load(fileContents) as { projects: YamlProject[] };

    let projects = data.projects || [];

    // Filter out archived
    projects = projects.filter((p) => !p.archived);

    // Apply filters
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

    // Sort by priority (high → medium → low → none), then rank, then alphabetically
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
    const { name, clientId, owner, stage, status, summary, previewUrl, liveUrl, repoUrl, priority } = body;

    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    // Generate an id from clientId and name (or just name)
    const slug = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const id = clientId
      ? `${slug(clientId)}-${slug(name)}`
      : slug(name);

    const newProject: YamlProject = {
      id,
      name,
      ...(clientId && { clientId }),
      ...(owner && { owner }),
      ...(stage && { stage }),
      ...(status && { status }),
      ...(summary && { summary }),
      ...(previewUrl && { previewUrl }),
      ...(liveUrl && { liveUrl }),
      ...(repoUrl && { repoUrl }),
      ...(priority && { priority }),
      lastUpdate: new Date().toISOString().split("T")[0],
    };

    const projectsPath = join(process.cwd(), "data", "projects.yaml");
    const fileContents = await readFile(projectsPath, "utf8");
    const data = yaml.load(fileContents) as { projects: YamlProject[] };

    const projects = data.projects || [];

    // Check for duplicate id
    if (projects.some((p) => p.id === id)) {
      return Response.json({ error: "A project with this ID already exists" }, { status: 409 });
    }

    projects.push(newProject);

    const updatedYaml = yaml.dump({ projects }, { lineWidth: -1 });
    await writeFile(projectsPath, updatedYaml, "utf8");

    return Response.json(newProject, { status: 201 });
  } catch (error: any) {
    console.error("Create project error:", error);
    return Response.json(
      { error: "Failed to create project", details: error.message },
      { status: 500 }
    );
  }
}
