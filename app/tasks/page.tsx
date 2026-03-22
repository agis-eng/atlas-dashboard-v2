"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  CheckCircle2,
  Circle,
  Clock,
  RefreshCw,
  ExternalLink,
  ListTodo,
  CalendarDays,
} from "lucide-react";

interface TaskItem {
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

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Circle }
> = {
  "in-progress": {
    label: "In Progress",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Clock,
  },
  backlog: {
    label: "Backlog",
    color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    icon: Circle,
  },
  recurring: {
    label: "Recurring",
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    icon: RefreshCw,
  },
  completed: {
    label: "Done",
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle2,
  },
};

const typeColors: Record<string, string> = {
  marketing: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  strategy: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  website: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  ecommerce: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  content: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  internal: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  admin: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      console.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  const statuses = [
    "all",
    ...Array.from(new Set(tasks.map((t) => t.status).filter(Boolean))).sort(),
  ];
  const assignees = [
    "all",
    ...Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean))).sort(),
  ];
  const types = [
    "all",
    ...Array.from(new Set(tasks.map((t) => t.type).filter(Boolean))).sort(),
  ];

  const filtered = tasks.filter((t) => {
    const matchesSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.notes?.toLowerCase().includes(search.toLowerCase()) ||
      t.project?.toLowerCase().includes(search.toLowerCase()) ||
      t.client?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || t.status === statusFilter;
    const matchesAssignee =
      assigneeFilter === "all" || t.assignee === assigneeFilter;
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    return matchesSearch && matchesStatus && matchesAssignee && matchesType;
  });

  const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    const s = t.status || "backlog";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function isOverdue(dateStr?: string | null) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            {loading
              ? "Loading tasks..."
              : `${filtered.length} of ${tasks.length} tasks`}
          </p>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["in-progress", "backlog", "recurring", "completed"] as const).map(
          (s) => {
            const cfg = statusConfig[s];
            const StatusIcon = cfg.icon;
            return (
              <button
                key={s}
                onClick={() =>
                  setStatusFilter(statusFilter === s ? "all" : s)
                }
                className={`rounded-lg border p-3 text-left transition-colors ${
                  statusFilter === s
                    ? "border-orange-600/50 bg-orange-600/5"
                    : "border-border hover:border-border/80 bg-card/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{cfg.label}</span>
                </div>
                <span className="text-2xl font-semibold">
                  {statusCounts[s] || 0}
                </span>
              </button>
            );
          }
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-2 text-sm"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === "all"
                  ? "All Status"
                  : (s && statusConfig[s as keyof typeof statusConfig]?.label) || s}
              </option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-2 text-sm"
          >
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "All Assignees" : a}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-2 text-sm"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All Types" : `${(t || "").charAt(0).toUpperCase()}${(t || "").slice(1)}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <ListTodo className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            No tasks match your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const cfg = statusConfig[task.status || "backlog"] || statusConfig.backlog;
            const StatusIcon = cfg.icon;
            const overdue = isOverdue(task.due_date);

            return (
              <Card
                key={task.id}
                className="group hover:shadow-md transition-shadow"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className="pt-0.5">
                      <StatusIcon className={`h-5 w-5 ${
                        task.status === "in-progress"
                          ? "text-blue-500"
                          : task.status === "completed"
                            ? "text-green-500"
                            : task.status === "recurring"
                              ? "text-purple-500"
                              : "text-muted-foreground"
                      }`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm leading-snug">
                            {task.title}
                          </h3>
                          {task.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {task.notes}
                            </p>
                          )}
                        </div>
                        {task.notion_url && (
                          <a
                            href={task.notion_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {/* Status badge */}
                        <span
                          className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>

                        {/* Priority */}
                        {task.priority && (
                          <span
                            className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                              task.priority === "high"
                                ? "bg-red-500/10 text-red-500"
                                : task.priority === "medium"
                                  ? "bg-yellow-500/10 text-yellow-500"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {task.priority}
                          </span>
                        )}

                        {/* Type badge */}
                        {task.type && (
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full border ${
                              typeColors[task.type] ||
                              "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            {task.type}
                          </span>
                        )}

                        {/* Assignee */}
                        {task.assignee && (
                          <span className="text-xs text-muted-foreground">
                            {task.assignee}
                          </span>
                        )}

                        {/* Due date */}
                        {task.due_date && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              overdue
                                ? "text-red-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(task.due_date)}
                          </span>
                        )}

                        {/* Project */}
                        {task.project && (
                          <span className="text-xs text-muted-foreground">
                            {task.project}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
