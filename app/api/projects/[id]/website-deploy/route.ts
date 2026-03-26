import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const PROJECT_SITE_BUILDS_PATH = join(process.cwd(), "data", "projectSiteBuilds.yaml");
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || "";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || process.env.VERCEL_TEAM || "";

async function loadYaml<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch {
    return fallback;
  }
}

async function vercelRequest(path: string, init: RequestInit = {}) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (VERCEL_TEAM_ID) url.searchParams.set("teamId", VERCEL_TEAM_ID);

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error((data && (data.error?.message || data.message || data.error)) || `Vercel API error (${res.status})`);
  }
  return data;
}

function extractRepo(repoUrl: string) {
  const match = String(repoUrl || "").match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!VERCEL_TOKEN) {
      return Response.json({
        error: "VERCEL_TOKEN is not configured in Railway environment yet.",
        needsConfig: true,
      }, { status: 400 });
    }

    const { id } = await params;
    const [projectsData, buildsData] = await Promise.all([
      loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] }),
      loadYaml<{ builds: any[] }>(PROJECT_SITE_BUILDS_PATH, { builds: [] }),
    ]);

    const project = (projectsData.projects || []).find((item) => item.id === id);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    if (!project.repoUrl) return Response.json({ error: "Create website repo first" }, { status: 400 });

    const parsed = extractRepo(project.repoUrl);
    if (!parsed) return Response.json({ error: "Invalid GitHub repo URL" }, { status: 400 });

    const existingBuild = (buildsData.builds || []).find((item) => item.projectId === id) || null;
    const projectName = parsed.repo;

    const createdProject = await vercelRequest(`/v10/projects`, {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        framework: "nextjs",
        gitRepository: {
          type: "github",
          repo: `${parsed.owner}/${parsed.repo}`,
        },
      }),
    }).catch(async (err) => {
      if (/already exists/i.test(String(err.message || ""))) {
        return await vercelRequest(`/v9/projects/${projectName}`);
      }
      throw err;
    });

    const deployment = await vercelRequest(`/v13/deployments`, {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        project: projectName,
        target: "production",
        gitSource: {
          type: "github",
          repo: `${parsed.owner}/${parsed.repo}`,
          ref: project.githubBranch || existingBuild?.branch || "main",
        },
      }),
    });

    const previewUrl = deployment?.url ? `https://${deployment.url}` : project.previewUrl || "";
    project.previewUrl = previewUrl;
    project.vercelUrl = createdProject?.link ? `https://${createdProject.link}` : project.vercelUrl || "";
    project.lastUpdate = new Date().toISOString().split("T")[0];
    if (!project.brain) project.brain = {};
    if (!project.brain.notes) project.brain.notes = [];
    project.brain.notes.unshift(`Vercel deploy started: ${previewUrl || project.vercelUrl || projectName}`);

    await writeFile(PROJECTS_PATH, yaml.dump(projectsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), "utf8");

    if (existingBuild) {
      existingBuild.status = "deploy-started";
      existingBuild.previewUrl = previewUrl;
      existingBuild.vercelProjectId = createdProject?.id || existingBuild.vercelProjectId;
      existingBuild.vercelProjectName = createdProject?.name || existingBuild.vercelProjectName;
      existingBuild.deploymentId = deployment?.id || existingBuild.deploymentId;
      existingBuild.updatedAt = new Date().toISOString();
      await writeFile(PROJECT_SITE_BUILDS_PATH, yaml.dump(buildsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), "utf8");
    }

    return Response.json({
      success: true,
      deploy: {
        projectId: createdProject?.id,
        projectName: createdProject?.name,
        deploymentId: deployment?.id,
        previewUrl,
        vercelUrl: project.vercelUrl || "",
      },
      needsConfig: false,
    });
  } catch (error: any) {
    console.error("Website deploy error:", error);
    return Response.json({ error: error.message || "Failed to start Vercel deploy" }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectsData = await loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] });
    const project = (projectsData.projects || []).find((item) => item.id === id);
    return Response.json({
      configured: Boolean(VERCEL_TOKEN),
      teamConfigured: Boolean(VERCEL_TEAM_ID),
      vercelUrl: project?.vercelUrl || "",
      previewUrl: project?.previewUrl || "",
    });
  } catch (error: any) {
    return Response.json({ error: error.message || "Failed to load deploy status" }, { status: 500 });
  }
}
