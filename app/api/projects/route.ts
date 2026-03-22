import { readFile } from "fs/promises";
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

const PROJECTS_YAML_PATH = join(
  process.env.PROJECTS_YAML_PATH ||
    "/Users/eriklaine/.openclaw/workspace/atlas-dashboard/data/projects.yaml"
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner"); // filter by owner
    const stage = searchParams.get("stage"); // filter by stage

    const fileContents = await readFile(PROJECTS_YAML_PATH, "utf8");
    const data = yaml.load(fileContents) as { projects: YamlProject[] };

    let projects = (data.projects || []).filter((p) => !p.archived);

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

    // Sort: ranked projects first (ascending rank), then alphabetically
    projects.sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    return Response.json({ projects, total: projects.length });
  } catch (error) {
    console.error("Failed to load projects:", error);
    return Response.json(
      { error: "Failed to load projects", projects: [] },
      { status: 500 }
    );
  }
}
