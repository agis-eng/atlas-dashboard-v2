import { readFile } from "fs/promises";
import { join } from "path";
import yaml from "js-yaml";

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

    const tasksPath = join(process.cwd(), "data", "tasks.yaml");
    const fileContents = await readFile(tasksPath, "utf8");
    const data = yaml.load(fileContents) as { tasks: YamlTask[] };

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

    return Response.json({ tasks });
  } catch (error: any) {
    console.error("Tasks API error:", error);
    return Response.json(
      { error: "Failed to load tasks", tasks: [], details: error.message },
      { status: 500 }
    );
  }
}
