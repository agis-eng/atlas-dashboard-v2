import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";
import { buildWebsiteRepoForProject } from "@/lib/project-website-build";

const PROJECTS_PATH = join(process.cwd(), "data", "projects.yaml");
const PROJECT_SITE_BUILDS_PATH = join(process.cwd(), "data", "projectSiteBuilds.yaml");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const VERCEL_TOKEN = process.env.ATLAS_VERCEL_TOKEN || process.env.VERCEL_TOKEN || "";
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

async function githubRequest(path: string, init: RequestInit = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not configured, so Atlas cannot read the saved GitHub repository for deploys.");
  }

  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Atlas-Dashboard",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `GitHub API error (${res.status})`);
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

function buildGitRepositoryConfig(parsed: { owner: string; repo: string }, branch: string) {
  return {
    type: "github",
    org: parsed.owner,
    repo: parsed.repo,
    productionBranch: branch,
  };
}

function normalizeHostname(value: string) {
  return String(value || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function asUrl(value: string) {
  const hostname = normalizeHostname(value);
  return hostname ? `https://${hostname}` : "";
}

function getVercelProjectUrl(vercelProject: any, deployment: any, fallbackName: string) {
  const aliasFinal = deployment?.aliasFinal || deployment?.alias?.[0];
  if (aliasFinal) return asUrl(aliasFinal);

  const latestUrl =
    vercelProject?.latestDeployments?.find((item: any) => item?.target === "production" && item?.url)?.url ||
    vercelProject?.latestDeployments?.[0]?.url;
  if (latestUrl) return asUrl(latestUrl);

  const projectName = String(vercelProject?.name || fallbackName || "").trim();
  return projectName ? `https://${projectName}.vercel.app` : "";
}

async function getVercelProject(projectNameOrId: string) {
  return vercelRequest(`/v9/projects/${encodeURIComponent(projectNameOrId)}`);
}

function coerceRepoId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function resolveVercelRepoId(vercelProject: any) {
  return (
    coerceRepoId(vercelProject?.link?.repoId) ||
    coerceRepoId(vercelProject?.link?.repo?.id) ||
    coerceRepoId(vercelProject?.gitRepository?.repoId) ||
    coerceRepoId(vercelProject?.gitRepository?.repo?.id) ||
    coerceRepoId(vercelProject?.source?.repoId)
  );
}

function describeVercelGitLink(vercelProject: any) {
  return {
    id: vercelProject?.id || null,
    name: vercelProject?.name || null,
    linkType: vercelProject?.link?.type || null,
    linkRepo: vercelProject?.link?.repo || null,
    linkRepoId: vercelProject?.link?.repoId ?? vercelProject?.link?.repo?.id ?? null,
    gitRepositoryType: vercelProject?.gitRepository?.type || null,
    gitRepositoryRepo: vercelProject?.gitRepository?.repo || null,
    gitRepositoryRepoId:
      vercelProject?.gitRepository?.repoId ?? vercelProject?.gitRepository?.repo?.id ?? null,
    sourceRepoId: vercelProject?.source?.repoId ?? null,
  };
}

function decodeGitHubBlob(content: string, encoding: string) {
  if (encoding !== "base64") {
    throw new Error(`Unsupported GitHub blob encoding: ${encoding || "unknown"}`);
  }

  return Buffer.from(String(content || ""), "base64").toString("utf8");
}

async function resolveGitHubRepo(parsed: { owner: string; repo: string }, branchHint?: string | null) {
  const repo = await githubRequest(`/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`);
  const branch = String(branchHint || repo?.default_branch || "main").trim() || "main";
  const branchData = await githubRequest(
    `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/branches/${encodeURIComponent(branch)}`
  );

  const treeSha = branchData?.commit?.commit?.tree?.sha;
  const commitSha = branchData?.commit?.sha;
  if (!treeSha || !commitSha) {
    throw new Error(`GitHub branch '${branch}' for ${parsed.owner}/${parsed.repo} is missing commit metadata.`);
  }

  return {
    id: coerceRepoId(repo?.id),
    defaultBranch: String(repo?.default_branch || "main").trim() || "main",
    branch,
    commitSha: String(commitSha),
    treeSha: String(treeSha),
    private: Boolean(repo?.private),
    htmlUrl: String(repo?.html_url || `https://github.com/${parsed.owner}/${parsed.repo}`),
  };
}

async function readGitHubRepoFiles(parsed: { owner: string; repo: string }, treeSha: string) {
  const tree = await githubRequest(
    `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`
  );

  const blobs = Array.isArray(tree?.tree)
    ? tree.tree.filter((entry: any) => entry?.type === "blob" && typeof entry?.path === "string" && entry.path)
    : [];

  if (!blobs.length) {
    throw new Error(`GitHub repo ${parsed.owner}/${parsed.repo} does not contain any deployable files.`);
  }

  if (blobs.length > 250) {
    throw new Error(
      `GitHub repo ${parsed.owner}/${parsed.repo} has ${blobs.length} files. Atlas manual deploy supports smaller website repos only; import/link this repository in Vercel for large repos.`
    );
  }

  const files = await Promise.all(
    blobs.map(async (blob: any) => {
      const blobData = await githubRequest(
        `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/blobs/${encodeURIComponent(String(blob.sha || ""))}`
      );

      return {
        file: String(blob.path),
        data: decodeGitHubBlob(String(blobData?.content || ""), String(blobData?.encoding || "")),
      };
    })
  );

  return files;
}

async function ensureVercelProjectLinked(
  projectName: string,
  parsed: { owner: string; repo: string },
  branch: string,
  fallbackRepoId?: string | null
) {
  const gitRepository = buildGitRepositoryConfig(parsed, branch);

  await vercelRequest(`/v11/projects`, {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      framework: "nextjs",
      gitRepository,
    }),
  }).catch(async (err) => {
    if (/already exists/i.test(String(err.message || ""))) return null;
    throw err;
  });

  let vercelProject = await getVercelProject(projectName);
  let repoId =
    resolveVercelRepoId(vercelProject) ||
    coerceRepoId(fallbackRepoId);
  if (!repoId) {
    vercelProject = await vercelRequest(`/v9/projects/${encodeURIComponent(projectName)}`, {
      method: "PATCH",
      body: JSON.stringify({
        framework: "nextjs",
        gitRepository,
      }),
    });

    repoId =
      resolveVercelRepoId(vercelProject) ||
      coerceRepoId(fallbackRepoId);
  }

  return {
    vercelProject,
    repoId: repoId ? String(repoId) : null,
    gitLinkState: describeVercelGitLink(vercelProject),
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!VERCEL_TOKEN) {
      return Response.json({
        error: "VERCEL_TOKEN is not configured. Add it in Vercel environment variables.",
        needsConfig: true,
      }, { status: 400 });
    }

    const { id } = await params;
    let [projectsData, buildsData] = await Promise.all([
      loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] }),
      loadYaml<{ builds: any[] }>(PROJECT_SITE_BUILDS_PATH, { builds: [] }),
    ]);

    let project = (projectsData.projects || []).find((item) => item.id === id);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    let repoCreated = false;
    if (!project.repoUrl) {
      await buildWebsiteRepoForProject(id);
      repoCreated = true;
      [projectsData, buildsData] = await Promise.all([
        loadYaml<{ projects: any[] }>(PROJECTS_PATH, { projects: [] }),
        loadYaml<{ builds: any[] }>(PROJECT_SITE_BUILDS_PATH, { builds: [] }),
      ]);
      project = (projectsData.projects || []).find((item) => item.id === id);
      if (!project?.repoUrl) {
        return Response.json({ error: "Create a website draft or save a GitHub repo first" }, { status: 400 });
      }
    }

    const parsed = extractRepo(project.repoUrl);
    if (!parsed) return Response.json({ error: "Invalid GitHub repo URL" }, { status: 400 });

    const existingBuild = (buildsData.builds || []).find((item) => item.projectId === id) || null;
    const projectName = parsed.repo;
    const branchHint = project.githubBranch || existingBuild?.branch || null;
    const githubRepo = await resolveGitHubRepo(parsed, branchHint);
    const branch = githubRepo.branch;
    const { vercelProject, repoId, gitLinkState } = await ensureVercelProjectLinked(
      projectName,
      parsed,
      branch,
      existingBuild?.vercelRepoId || null
    );

    const deployMode = repoId ? "git-linked" : "manual-files";
    const deployment = await vercelRequest(`/v13/deployments?skipAutoDetectionConfirmation=1`, {
      method: "POST",
      body: JSON.stringify(
        repoId
          ? {
              name: projectName,
              project: vercelProject?.id || projectName,
              target: "production",
              gitSource: {
                type: "github",
                org: parsed.owner,
                repo: parsed.repo,
                repoId,
                ref: branch,
              },
            }
          : {
              name: projectName,
              project: vercelProject?.id || projectName,
              target: "production",
              files: await readGitHubRepoFiles(parsed, githubRepo.treeSha),
              gitMetadata: {
                remoteUrl: githubRepo.htmlUrl,
                commitRef: branch,
                commitSha: githubRepo.commitSha,
              },
              meta: {
                atlasDeployMode: "manual-files",
                atlasRepoUrl: githubRepo.htmlUrl,
              },
              projectSettings: {
                framework: "nextjs",
              },
            }
      ),
    });

    const previewUrl = deployment?.url ? `https://${deployment.url}` : project.previewUrl || "";
    const vercelUrl = getVercelProjectUrl(vercelProject, deployment, projectName) || project.vercelUrl || "";
    project.githubBranch = branch;
    project.previewUrl = previewUrl;
    project.vercelUrl = vercelUrl;
    project.lastUpdate = new Date().toISOString().split("T")[0];
    if (!project.brain) project.brain = {};
    if (!project.brain.notes) project.brain.notes = [];
    project.brain.notes.unshift(
      deployMode === "git-linked"
        ? `Vercel deploy started from linked GitHub repo: ${previewUrl || vercelUrl || projectName}`
        : `Vercel manual deploy started from GitHub snapshot (${branch}): ${previewUrl || vercelUrl || projectName}`
    );

    await writeFile(PROJECTS_PATH, yaml.dump(projectsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), "utf8");

    if (existingBuild) {
      existingBuild.status = "deploy-started";
      existingBuild.previewUrl = previewUrl;
      existingBuild.vercelProjectId = vercelProject?.id || existingBuild.vercelProjectId;
      existingBuild.vercelProjectName = vercelProject?.name || existingBuild.vercelProjectName;
      existingBuild.vercelRepoId = repoId || existingBuild.vercelRepoId;
      existingBuild.branch = branch;
      existingBuild.deployMode = deployMode;
      existingBuild.deploymentId = deployment?.id || existingBuild.deploymentId;
      existingBuild.updatedAt = new Date().toISOString();
      await writeFile(PROJECT_SITE_BUILDS_PATH, yaml.dump(buildsData, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }), "utf8");
    }

    return Response.json({
      success: true,
      deploy: {
        projectId: vercelProject?.id,
        projectName: vercelProject?.name,
        deploymentId: deployment?.id,
        previewUrl,
        vercelUrl,
        repoUrl: project.repoUrl || "",
        branch,
        mode: deployMode,
        repoLinked: Boolean(repoId),
        linkState: gitLinkState,
        repoCreated,
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
