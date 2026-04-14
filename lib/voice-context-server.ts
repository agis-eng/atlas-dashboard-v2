import {
  getProjectDetails,
  getTasks,
  loadProjects,
  loadTasks,
  type Project,
  type Task,
} from "@/lib/data";
import {
  sanitizeVoiceContext,
  type VoiceContext,
  type VoiceScope,
} from "@/lib/voice-context";

type RouteModule = {
  key: string;
  label: string;
  description: string;
};

const ROUTE_MODULES: Array<{
  test: RegExp;
  module: RouteModule;
}> = [
  {
    test: /^\/$/,
    module: {
      key: "dashboard",
      label: "Dashboard",
      description: "overall dashboard health, active projects, open tasks, and current build status",
    },
  },
  {
    test: /^\/chat$/,
    module: {
      key: "chat",
      label: "Main Chat",
      description: "dashboard-wide conversation context, recent assistant replies, and cross-project questions",
    },
  },
  {
    test: /^\/projects$/,
    module: {
      key: "projects",
      label: "Projects",
      description: "the project index, ownership, stages, statuses, and website delivery work",
    },
  },
  {
    test: /^\/projects\/[^/]+$/,
    module: {
      key: "project-detail",
      label: "Project",
      description: "a single project workspace, its metadata, and related execution details",
    },
  },
  {
    test: /^\/tasks$/,
    module: {
      key: "tasks",
      label: "Tasks",
      description: "task status, priority, due dates, assignees, and execution backlog",
    },
  },
  {
    test: /^\/calendar$/,
    module: {
      key: "calendar",
      label: "Calendar",
      description: "events, scheduling context, and near-term workload timing",
    },
  },
  {
    test: /^\/brain$/,
    module: {
      key: "brain",
      label: "Brain",
      description: "knowledge capture, saved ideas, and reference material",
    },
  },
  {
    test: /^\/trends$/,
    module: {
      key: "trends",
      label: "Trends",
      description: "trend monitoring, research inputs, and signal review",
    },
  },
  {
    test: /^\/email$/,
    module: {
      key: "email",
      label: "Email",
      description: "inbox triage, outgoing email work, and communication context",
    },
  },
  {
    test: /^\/transcribe$/,
    module: {
      key: "transcribe",
      label: "Transcribe",
      description: "audio or video transcription workflows and resulting notes",
    },
  },
  {
    test: /^\/memory$/,
    module: {
      key: "memory",
      label: "Memory",
      description: "stored memories, summaries, and searchable historical context",
    },
  },
  {
    test: /^\/clients(?:\/[^/]+)?$/,
    module: {
      key: "clients",
      label: "Clients",
      description: "client profiles, linked projects, and account-specific context",
    },
  },
  {
    test: /^\/monitor$/,
    module: {
      key: "monitor",
      label: "Monitor",
      description: "system monitoring signals and operational checks",
    },
  },
  {
    test: /^\/settings$/,
    module: {
      key: "settings",
      label: "Settings",
      description: "dashboard configuration and environment setup",
    },
  },
  {
    test: /^\/voice$/,
    module: {
      key: "voice",
      label: "Voice",
      description: "the voice handoff surface and active session context",
    },
  },
];

function normalizeRoute(route?: string) {
  const trimmed = route?.trim();
  if (!trimmed) return "/voice";
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "") || "/";
}

function inferRouteModule(route: string): RouteModule {
  return (
    ROUTE_MODULES.find((entry) => entry.test.test(route))?.module ?? {
      key: "page",
      label: "Page",
      description: "the current dashboard surface and its local context",
    }
  );
}

function inferProjectId(context: VoiceContext) {
  if (context.projectId) return context.projectId;

  const match = normalizeRoute(context.route).match(/^\/projects\/([^/]+)$/);
  return match?.[1];
}

function inferScope(context: VoiceContext): VoiceScope {
  const route = normalizeRoute(context.route);

  if (inferProjectId(context)) return "project";
  if (context.source === "main-chat") return "main-chat";
  if (route !== "/voice") return "page";
  return "global";
}

function buildTaskStats(tasks: Task[]) {
  const openTasks = tasks.filter((task) => task.status !== "completed");
  const dueSoon = openTasks.filter((task) => {
    if (!task.due_date) return false;
    const due = new Date(task.due_date);
    const now = new Date();
    const inSevenDays = new Date(now);
    inSevenDays.setDate(now.getDate() + 7);
    return due >= now && due <= inSevenDays;
  });

  return {
    openCount: openTasks.length,
    dueSoonCount: dueSoon.length,
  };
}

function summarizeProject(project: Project, tasks: Task[]) {
  const taskStats = buildTaskStats(tasks);
  const urls = [project.liveUrl ? "live site" : null, project.previewUrl ? "preview" : null]
    .filter(Boolean)
    .join(" + ");

  const parts = [
    `${project.name} is a ${project.stage || "active"} project`,
    project.status ? `currently ${project.status}` : null,
    project.owner ? `owned by ${project.owner}` : null,
    project.priority ? `priority ${project.priority}` : null,
    taskStats.openCount > 0 ? `${taskStats.openCount} open tasks` : "no open tasks tracked",
    taskStats.dueSoonCount > 0 ? `${taskStats.dueSoonCount} due within 7 days` : null,
    urls ? `${urls} available` : null,
  ].filter(Boolean);

  return `${parts.join(", ")}.`;
}

function buildProjectHints(project: Project, tasks: Task[]) {
  const taskStats = buildTaskStats(tasks);

  return [
    `Project: ${project.name}`,
    project.stage ? `Stage: ${project.stage}` : null,
    project.status ? `Status: ${project.status}` : null,
    project.owner ? `Owner: ${project.owner}` : null,
    taskStats.openCount > 0 ? `Open tasks: ${taskStats.openCount}` : null,
    project.summary ? `Summary: ${project.summary}` : null,
  ].filter((value): value is string => Boolean(value));
}

function summarizeGlobal(projects: Project[], tasks: Task[]) {
  const taskStats = buildTaskStats(tasks);
  const projectOwners = Array.from(
    new Set(projects.map((project) => project.owner).filter(Boolean))
  );
  const inProgressProjects = projects.filter(
    (project) => project.stage?.toLowerCase() === "in-progress"
  ).length;

  return `Atlas currently tracks ${projects.length} active projects, ${taskStats.openCount} open tasks, ${taskStats.dueSoonCount} tasks due within 7 days, and ${projectOwners.length} active owners. ${inProgressProjects > 0 ? `${inProgressProjects} projects are marked in-progress.` : "Project work is spread across multiple stages."}`;
}

function buildGlobalHints(projects: Project[], tasks: Task[]) {
  const taskStats = buildTaskStats(tasks);
  const topOwners = Array.from(
    projects.reduce((acc, project) => {
      if (!project.owner) return acc;
      acc.set(project.owner, (acc.get(project.owner) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([owner, count]) => `${owner}: ${count} projects`);

  return [
    `Active projects: ${projects.length}`,
    `Open tasks: ${taskStats.openCount}`,
    taskStats.dueSoonCount > 0 ? `Due soon: ${taskStats.dueSoonCount} tasks` : null,
    topOwners.length > 0 ? `Top owners: ${topOwners.join(", ")}` : null,
    "Scope: whole dashboard and site operations",
  ].filter((value): value is string => Boolean(value));
}

function summarizePage(module: RouteModule, route: string) {
  return `${module.label} route ${route} is in scope. Voice should understand ${module.description}.`;
}

function buildPageHints(module: RouteModule, route: string) {
  return [
    `Route: ${route}`,
    `Module: ${module.label}`,
    `Understand: ${module.description}`,
  ];
}

export async function enrichVoiceContext(
  rawContext: VoiceContext | null
): Promise<VoiceContext | null> {
  if (!rawContext) return null;

  const baseContext = sanitizeVoiceContext(rawContext);
  const route = normalizeRoute(baseContext.route);
  const scope = inferScope(baseContext);
  const module = inferRouteModule(route);

  if (scope === "project") {
    const projectId = inferProjectId(baseContext);
    const project = projectId
      ? await getProjectDetails({ project_id: projectId })
      : null;

    if (project) {
      const projectTasks = await getTasks({ project: project.id });

      return sanitizeVoiceContext({
        ...baseContext,
        route,
        projectId: project.id,
        projectName: project.name,
        threadId: baseContext.threadId ?? project.id,
        threadLabel: baseContext.threadLabel ?? project.name,
        scope,
        scopeLabel: "Project Session",
        moduleKey: module.key,
        moduleLabel: "Project Workspace",
        contextSummary: summarizeProject(project, projectTasks),
        contextHints: buildProjectHints(project, projectTasks),
      });
    }
  }

  if (scope === "main-chat") {
    const [projects, tasks] = await Promise.all([loadProjects(), loadTasks()]);

    return sanitizeVoiceContext({
      ...baseContext,
      route,
      scope,
      scopeLabel: "Main Chat Session",
      moduleKey: module.key,
      moduleLabel: module.label,
      contextSummary: summarizeGlobal(projects, tasks),
      contextHints: [
        ...buildGlobalHints(projects, tasks),
        "Main chat can reference projects, tasks, clients, and dashboard data",
      ],
    });
  }

  if (scope === "page") {
    return sanitizeVoiceContext({
      ...baseContext,
      route,
      scope,
      scopeLabel: "Page Session",
      moduleKey: module.key,
      moduleLabel: module.label,
      contextSummary: summarizePage(module, route),
      contextHints: buildPageHints(module, route),
    });
  }

  const [projects, tasks] = await Promise.all([loadProjects(), loadTasks()]);

  return sanitizeVoiceContext({
    ...baseContext,
    route,
    scope,
    scopeLabel: "Global Voice Session",
    moduleKey: module.key,
    moduleLabel: module.label,
    contextSummary: summarizeGlobal(projects, tasks),
    contextHints: buildGlobalHints(projects, tasks),
  });
}
