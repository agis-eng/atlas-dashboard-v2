import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

const TASKS_PATH = join(process.cwd(), "data", "tasks.yaml");

async function loadTasksFile(): Promise<{ tasks: YamlTask[] }> {
  const fileContents = await readFile(TASKS_PATH, "utf8");
  return (yaml.load(fileContents) as { tasks: YamlTask[] }) || { tasks: [] };
}

async function saveTasksFile(data: { tasks: YamlTask[] }): Promise<void> {
  const yamlStr = yaml.dump(data, { lineWidth: -1, noRefs: true });
  await writeFile(TASKS_PATH, yamlStr, "utf8");
}

interface YamlTask {
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const assignee = searchParams.get("assignee");
    const type = searchParams.get("type");

    const data = await loadTasksFile();
    let tasks = data.tasks || [];

    if (status) {
      tasks = tasks.filter(
        (t) => t.status?.toLowerCase() === status.toLowerCase()
      );
    }
    if (assignee) {
      tasks = tasks.filter(
        (t) => t.assignee?.toLowerCase() === assignee.toLowerCase()
      );
    }
    if (type) {
      tasks = tasks.filter(
        (t) => t.type?.toLowerCase() === type.toLowerCase()
      );
    }

    // Sort: in-progress first, then by priority (high > medium > low), then alphabetically
    const statusOrder: Record<string, number> = {
      recurring: 0,
      backlog: 1,
      "in-progress": 2,
      review: 3,
      completed: 4,
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

    return Response.json({ tasks });
  } catch (error: any) {
    console.error("Tasks API error:", error);
    return Response.json(
      { error: "Failed to load tasks", tasks: [], details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.title?.trim()) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    const data = await loadTasksFile();
    const newTask: YamlTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: body.title.trim(),
      status: body.status || "backlog",
      priority: body.priority || "medium",
      type: body.type || "",
      platforms: body.platforms || [],
      project: body.project || "",
      client: body.client || "",
      assignee: body.assignee || "",
      due_date: body.due_date || null,
      notes: body.notes || "",
      tags: body.tags || [],
      notion_url: body.notion_url || "",
      updated_at: new Date().toISOString(),
    };

    data.tasks.push(newTask);
    await saveTasksFile(data);
    return Response.json({ task: newTask }, { status: 201 });
  } catch (error: any) {
    console.error("Create task error:", error);
    return Response.json({ error: "Failed to create task", details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) {
      return Response.json({ error: "Task ID is required" }, { status: 400 });
    }

    const data = await loadTasksFile();
    const idx = data.tasks.findIndex((t) => t.id === body.id);
    if (idx === -1) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const updatable = ["title", "status", "priority", "type", "platforms", "project", "client", "assignee", "due_date", "notes", "tags", "notion_url"] as const;
    for (const key of updatable) {
      if (body[key] !== undefined) {
        (data.tasks[idx] as any)[key] = body[key];
      }
    }
    data.tasks[idx].updated_at = new Date().toISOString();

    await saveTasksFile(data);
    return Response.json({ task: data.tasks[idx] });
  } catch (error: any) {
    console.error("Update task error:", error);
    return Response.json({ error: "Failed to update task", details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "Task ID is required" }, { status: 400 });
    }

    const data = await loadTasksFile();
    const idx = data.tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    data.tasks.splice(idx, 1);
    await saveTasksFile(data);
    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Delete task error:", error);
    return Response.json({ error: "Failed to delete task", details: error.message }, { status: 500 });
  }
}
