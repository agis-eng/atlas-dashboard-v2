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
  affiliate?: {
    active?: boolean;
    program_name?: string;
    commission?: string;
    commission_type?: string;
    commission_pct?: number;
    avg_deal_size?: number;
    monthly_leads?: number;
    monthly_potential?: number;
    status?: string;
    notes?: string;
    affiliate_url?: string;
    signup_url?: string;
  };
  brain?: Record<string, unknown>;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const projectsPath = join(process.cwd(), "data", "projects.yaml");
    const fileContents = await readFile(projectsPath, "utf8");
    const data = yaml.load(fileContents) as { projects: YamlProject[] };

    const project = (data.projects || []).find((p) => p.id === id);

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    return Response.json({ project });
  } catch (error: any) {
    console.error("Project detail API error:", error);
    return Response.json(
      { error: "Failed to load project", details: error.message },
      { status: 500 }
    );
  }
}
