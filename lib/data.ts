import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

export interface Project {
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
}

export interface Task {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  type?: string;
  platforms?: string[];
  project?: string;
  client?: string;
  assignee?: string;
  due_date?: string | null;
  notes?: string;
  tags?: string[];
  notion_url?: string;
  updated_at?: string;
}

async function loadYaml<T>(filename: string): Promise<T> {
  const filePath = join(process.cwd(), "data", filename);
  const contents = await readFile(filePath, "utf8");
  return yaml.load(contents) as T;
}

export async function loadProjects(): Promise<Project[]> {
  const data = await loadYaml<{ projects: Project[] }>("projects.yaml");
  return (data.projects || []).filter((p) => !p.archived);
}

export async function loadTasks(): Promise<Task[]> {
  const data = await loadYaml<{ tasks: Task[] }>("tasks.yaml");
  return data.tasks || [];
}

function matchesText(value: string | undefined, query: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(query.toLowerCase());
}

export async function searchProjects(params: {
  query?: string;
  owner?: string;
  stage?: string;
  client?: string;
}): Promise<Project[]> {
  let projects = await loadProjects();

  if (params.owner) {
    projects = projects.filter((p) =>
      matchesText(p.owner, params.owner!)
    );
  }
  if (params.stage) {
    projects = projects.filter((p) =>
      matchesText(p.stage, params.stage!)
    );
  }
  if (params.client) {
    projects = projects.filter((p) =>
      matchesText(p.clientId, params.client!) ||
      matchesText(p.name, params.client!)
    );
  }
  if (params.query) {
    const q = params.query.toLowerCase();
    projects = projects.filter(
      (p) =>
        matchesText(p.name, q) ||
        matchesText(p.status, q) ||
        matchesText(p.summary, q) ||
        matchesText(p.clientId, q) ||
        matchesText(p.owner, q) ||
        matchesText(p.stage, q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }

  return projects;
}

export async function getProjectDetails(params: {
  project_id?: string;
  project_name?: string;
}): Promise<Project | null> {
  const projects = await loadProjects();

  if (params.project_id) {
    return projects.find((p) => p.id === params.project_id) || null;
  }
  if (params.project_name) {
    const name = params.project_name.toLowerCase();
    return (
      projects.find((p) => p.name.toLowerCase() === name) ||
      projects.find((p) => p.name.toLowerCase().includes(name)) ||
      null
    );
  }
  return null;
}

export async function getTasks(params: {
  status?: string;
  assignee?: string;
  priority?: string;
  type?: string;
  project?: string;
  query?: string;
}): Promise<Task[]> {
  let tasks = await loadTasks();

  if (params.status) {
    tasks = tasks.filter((t) =>
      matchesText(t.status, params.status!)
    );
  }
  if (params.assignee) {
    tasks = tasks.filter((t) =>
      matchesText(t.assignee, params.assignee!)
    );
  }
  if (params.priority) {
    tasks = tasks.filter((t) =>
      matchesText(t.priority, params.priority!)
    );
  }
  if (params.type) {
    tasks = tasks.filter((t) =>
      matchesText(t.type, params.type!)
    );
  }
  if (params.project) {
    tasks = tasks.filter((t) =>
      matchesText(t.project, params.project!) ||
      matchesText(t.client, params.project!)
    );
  }
  if (params.query) {
    const q = params.query.toLowerCase();
    tasks = tasks.filter(
      (t) =>
        matchesText(t.title, q) ||
        matchesText(t.notes, q) ||
        matchesText(t.project, q) ||
        matchesText(t.client, q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  }

  // Sort: in-progress first, then priority
  const statusOrder: Record<string, number> = {
    "in-progress": 0,
    recurring: 1,
    backlog: 2,
    completed: 3,
  };
  const priorityOrder: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  tasks.sort((a, b) => {
    const sa = statusOrder[a.status || "backlog"] ?? 2;
    const sb = statusOrder[b.status || "backlog"] ?? 2;
    if (sa !== sb) return sa - sb;
    const pa = priorityOrder[a.priority || "medium"] ?? 1;
    const pb = priorityOrder[b.priority || "medium"] ?? 1;
    if (pa !== pb) return pa - pb;
    return (a.title || "").localeCompare(b.title || "");
  });

  return tasks;
}

export async function searchData(params: {
  query: string;
}): Promise<{ projects: Project[]; tasks: Task[] }> {
  const [projects, tasks] = await Promise.all([
    searchProjects({ query: params.query }),
    getTasks({ query: params.query }),
  ]);
  return { projects, tasks };
}

export async function analyzeWorkload(params: {
  user1: string;
  user2?: string;
}): Promise<Record<string, unknown>> {
  const allTasks = await loadTasks();
  const allProjects = await loadProjects();

  function userStats(name: string) {
    const tasks = allTasks.filter((t) =>
      matchesText(t.assignee, name)
    );
    const projects = allProjects.filter((p) =>
      matchesText(p.owner, name)
    );

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const t of tasks) {
      const s = t.status || "unknown";
      const p = t.priority || "unknown";
      const tp = t.type || "unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
      byPriority[p] = (byPriority[p] || 0) + 1;
      byType[tp] = (byType[tp] || 0) + 1;
    }

    const overdue = tasks.filter((t) => {
      if (!t.due_date) return false;
      return new Date(t.due_date) < new Date();
    });

    return {
      name,
      total_tasks: tasks.length,
      tasks_by_status: byStatus,
      tasks_by_priority: byPriority,
      tasks_by_type: byType,
      overdue_tasks: overdue.length,
      overdue_task_titles: overdue.map((t) => t.title),
      total_projects: projects.length,
      project_stages: projects.reduce(
        (acc, p) => {
          const s = p.stage || "unknown";
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }

  const result: Record<string, unknown> = {
    user1: userStats(params.user1),
  };

  if (params.user2) {
    result.user2 = userStats(params.user2);
  }

  return result;
}
