import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { buildWebsiteRepoForProject } from "@/lib/project-website-build";

const PROJECT_SITE_BUILDS_PATH = join(process.cwd(), "data", "projectSiteBuilds.yaml");

async function loadYaml<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch {
    return fallback;
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { buildRecord } = await buildWebsiteRepoForProject(id);
    return Response.json({ success: true, build: buildRecord });
  } catch (error: any) {
    console.error("Website build error:", error);
    return Response.json({ error: error.message || "Failed to create website build" }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const buildsData = await loadYaml<{ builds: any[] }>(PROJECT_SITE_BUILDS_PATH, { builds: [] });
    const build = (buildsData.builds || []).find((item) => item.projectId === id) || null;
    return Response.json({ build });
  } catch (error: any) {
    return Response.json({ error: error.message || "Failed to load site build" }, { status: 500 });
  }
}
