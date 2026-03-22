"use client";

import { useEffect, useState } from "react";
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

const COLUMNS = [
  { key: "backlog", label: "Backlog", dotColor: "bg-zinc-400", icon: Circle },
  { key: "in-progress", label: "In Progress", dotColor: "bg-blue-500", icon: Clock },
  { key: "recurring", label: "Review", dotColor: "bg-purple-500", icon: RefreshCw },
  { key: "completed", label: "Done", dotColor: "bg-green-500", icon: CheckCircle2 },
] as const;

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
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

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
    const matchesAssignee =
      assigneeFilter === "all" || t.assignee === assigneeFilter;
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    return matchesSearch && matchesAssignee && matchesType;
  });

  function getColumnTasks(columnKey: string) {
    return filtered.filter((t) => (t.status || "backlog") === columnKey);
  }

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function isOverdue(dateStr?: string | null) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  async function handleDrop(taskId: string, newStatus: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await fetch("/api/update-task-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: task.status } : t
        )
      );
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-full mx-auto space-y-6">
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

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
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

      {/* Kanban Board */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="space-y-3">
              <div className="h-8 bg-muted rounded animate-pulse" />
              <div className="h-24 bg-muted rounded animate-pulse" />
              <div className="h-24 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUMNS.map((col) => {
            const colTasks = getColumnTasks(col.key);
            const ColIcon = col.icon;
            return (
              <div
                key={col.key}
                className={`rounded-lg border bg-muted/30 min-h-[300px] flex flex-col transition-colors ${
                  dragOverCol === col.key ? "border-orange-500/50 bg-orange-500/5" : "border-border"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.key);
                }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                    setDragOverCol(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  const taskId = e.dataTransfer.getData("text/plain");
                  if (taskId) handleDrop(taskId, col.key);
                }}
              >
                {/* Column Header */}
                <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.dotColor}`} />
                  <h3 className="text-sm font-semibold flex-1">{col.label}</h3>
                  <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {colTasks.length}
                  </span>
                </div>

                {/* Column Body */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {colTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-20">
                      <p className="text-xs text-muted-foreground">No tasks</p>
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const overdue = isOverdue(task.due_date);
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", task.id);
                          }}
                          className="group rounded-md border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
                        >
                          {/* Title row */}
                          <div className="flex items-start justify-between gap-1">
                            <h4 className="text-sm font-medium leading-snug">
                              {task.title}
                            </h4>
                            {task.notion_url && (
                              <a
                                href={task.notion_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>

                          {/* Notes */}
                          {task.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {task.notes}
                            </p>
                          )}

                          {/* Tags row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {task.priority === "high" && (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-500/10 text-red-500">
                                HIGH
                              </span>
                            )}
                            {task.type && (
                              <span
                                className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border ${
                                  typeColors[task.type] ||
                                  "bg-muted text-muted-foreground border-border"
                                }`}
                              >
                                {task.type}
                              </span>
                            )}
                            {task.client && (
                              <span className="text-[10px] text-muted-foreground">
                                {task.client}
                              </span>
                            )}
                          </div>

                          {/* Footer */}
                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/50">
                            {task.assignee ? (
                              <span className="text-[11px] text-muted-foreground font-medium">
                                {task.assignee}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/50">
                                Unassigned
                              </span>
                            )}
                            {task.due_date && (
                              <span
                                className={`inline-flex items-center gap-0.5 text-[11px] ${
                                  overdue
                                    ? "text-red-500"
                                    : "text-muted-foreground"
                                }`}
                              >
                                <CalendarDays className="h-3 w-3" />
                                {formatDate(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
