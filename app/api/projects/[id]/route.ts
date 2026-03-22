import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { captureProjectScreenshot } from "@/lib/screenshot";

interface BrainLink {
  url: string;
  label: string;
}

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
  brain?: {
    links?: BrainLink[];
    notes?: string[];
  };
}

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");

async function loadProjectsData(): Promise<{ projects: YamlProject[] }> {
  const fileContents = await readFile(PROJECTS_PATH, "utf8");
  // Use JSON_SCHEMA to prevent js-yaml from auto-converting date strings to Date objects
  return yaml.load(fileContents, { schema: yaml.JSON_SCHEMA }) as {
    projects: YamlProject[];
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await loadProjectsData();
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await loadProjectsData();
    const projectIndex = (data.projects || []).findIndex((p) => p.id === id);

    if (projectIndex === -1) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // Soft delete: mark as archived
    data.projects[projectIndex].archived = true;
    data.projects[projectIndex].lastUpdate = new Date().toISOString().split("T")[0];

    // Write back to YAML
    const yamlStr = yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    });
    await writeFile(PROJECTS_PATH, yamlStr, "utf8");

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Project delete API error:", error);
    return Response.json(
      { error: "Failed to delete project", details: error.message },
      { status: 500 }
    );
  }
}

const EDITABLE_FIELDS = [
  "name",
  "owner",
  "clientId",
  "stage",
  "status",
  "priority",
  "tags",
  "summary",
  "affiliate",
  "brain",
] as const;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();

    const data = await loadProjectsData();
    const projectIndex = (data.projects || []).findIndex((p) => p.id === id);

    if (projectIndex === -1) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // Only allow updating known editable fields
    for (const key of Object.keys(updates)) {
      if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) {
        return Response.json(
          { error: `Field '${key}' is not editable` },
          { status: 400 }
        );
      }
    }

    // Merge updates into existing project
    const project = data.projects[projectIndex];
    for (const key of EDITABLE_FIELDS) {
      if (key in updates) {
        (project as any)[key] = updates[key];
      }
    }

    // Update lastUpdate timestamp
    project.lastUpdate = new Date().toISOString().split("T")[0];

    // Write back to YAML
    const yamlStr = yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    });
    await writeFile(PROJECTS_PATH, yamlStr, "utf8");

    // Auto-capture screenshot if URL was added/changed
    const url = project.liveUrl || project.previewUrl;
    if (url && (updates.liveUrl || updates.previewUrl)) {
      // Run in background, don't wait for it
      captureProjectScreenshot(project.id, url).catch((err) =>
        console.error("Screenshot capture failed:", err)
      );
    }

    return Response.json({ project });
  } catch (error: any) {
    console.error("Project update API error:", error);
    return Response.json(
      { error: "Failed to update project", details: error.message },
      { status: 500 }
    );
  }
}
