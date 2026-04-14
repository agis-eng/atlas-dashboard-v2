import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { captureProjectScreenshot } from "@/lib/screenshot";
import { getRedis } from "@/lib/redis";

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

async function findProjectById(id: string, request: Request): Promise<YamlProject | null> {
  // Check YAML first
  try {
    const data = await loadProjectsData();
    const yamlProject = (data.projects || []).find((p) => p.id === id);
    if (yamlProject) return yamlProject;
  } catch {
    // YAML might not exist
  }

  // Check Redis for user-created projects
  try {
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    const redis = getRedis();
    const redisProjects =
      ((await redis.get(`projects:custom:${user?.profile || "erik"}`)) as YamlProject[]) || [];
    const redisProject = redisProjects.find((p) => p.id === id);
    if (redisProject) return redisProject;
  } catch {
    // Redis might not be available
  }

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await findProjectById(id, request);

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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try YAML first
    const data = await loadProjectsData();
    const projectIndex = (data.projects || []).findIndex((p) => p.id === id);

    if (projectIndex !== -1) {
      // Soft delete in YAML
      data.projects[projectIndex].archived = true;
      data.projects[projectIndex].lastUpdate = new Date().toISOString().split("T")[0];

      const yamlStr = yaml.dump(data, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      });
      await writeFile(PROJECTS_PATH, yamlStr, "utf8");
      return Response.json({ success: true });
    }

    // Try Redis
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    const redis = getRedis();
    const key = `projects:custom:${user?.profile || "erik"}`;
    const redisProjects = ((await redis.get(key)) as YamlProject[]) || [];
    const redisIdx = redisProjects.findIndex((p) => p.id === id);

    if (redisIdx !== -1) {
      redisProjects[redisIdx].archived = true;
      redisProjects[redisIdx].lastUpdate = new Date().toISOString().split("T")[0];
      await redis.set(key, redisProjects);
      return Response.json({ success: true });
    }

    return Response.json({ error: "Project not found" }, { status: 404 });
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

    // Only allow updating known editable fields
    for (const key of Object.keys(updates)) {
      if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) {
        return Response.json(
          { error: `Field '${key}' is not editable` },
          { status: 400 }
        );
      }
    }

    // Try YAML first
    const data = await loadProjectsData();
    const projectIndex = (data.projects || []).findIndex((p) => p.id === id);

    if (projectIndex !== -1) {
      // Update in YAML
      const project = data.projects[projectIndex];
      for (const key of EDITABLE_FIELDS) {
        if (key in updates) {
          (project as any)[key] = updates[key];
        }
      }
      project.lastUpdate = new Date().toISOString().split("T")[0];

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
        captureProjectScreenshot(project.id, url).catch((err) =>
          console.error("Screenshot capture failed:", err)
        );
      }

      return Response.json({ project });
    }

    // Try Redis
    const { getSessionUserFromRequest } = await import("@/lib/auth");
    const user = await getSessionUserFromRequest(request);
    const redis = getRedis();
    const key = `projects:custom:${user?.profile || "erik"}`;
    const redisProjects = ((await redis.get(key)) as YamlProject[]) || [];
    const redisIdx = redisProjects.findIndex((p) => p.id === id);

    if (redisIdx !== -1) {
      const project = redisProjects[redisIdx];
      for (const k of EDITABLE_FIELDS) {
        if (k in updates) {
          (project as any)[k] = updates[k];
        }
      }
      project.lastUpdate = new Date().toISOString().split("T")[0];
      await redis.set(key, redisProjects);

      const url = project.liveUrl || project.previewUrl;
      if (url && (updates.liveUrl || updates.previewUrl)) {
        captureProjectScreenshot(project.id, url).catch((err) =>
          console.error("Screenshot capture failed:", err)
        );
      }

      return Response.json({ project });
    }

    return Response.json({ error: "Project not found" }, { status: 404 });
  } catch (error: any) {
    console.error("Project update API error:", error);
    return Response.json(
      { error: "Failed to update project", details: error.message },
      { status: 500 }
    );
  }
}
