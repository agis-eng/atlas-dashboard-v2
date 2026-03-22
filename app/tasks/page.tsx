"use client";

import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  CheckCircle2,
  Circle,
  Clock,
  RefreshCw,
  ExternalLink,
  CalendarDays,
  Plus,
  X,
  Check,
  Pencil,
  Trash2,
  AlertCircle,
  Bot,
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
  { key: "recurring", label: "Recurring", dotColor: "bg-yellow-500", icon: RefreshCw },
  { key: "backlog", label: "Backlog", dotColor: "bg-zinc-400", icon: Circle },
  { key: "in-progress", label: "In Progress", dotColor: "bg-blue-500", icon: Clock },
  { key: "review", label: "Review", dotColor: "bg-purple-500", icon: AlertCircle },
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

const ASSIGNEES = ["Erik", "Anton", "Atlas"];
const TYPES = ["marketing", "strategy", "website", "ecommerce", "content", "internal", "admin"];
const PRIORITIES = ["high", "medium", "low"];

const emptyTask: Partial<TaskItem> = {
  title: "",
  status: "backlog",
  priority: "medium",
  type: "",
  project: "",
  client: "",
  assignee: "",
  notes: "",
  tags: [],
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TaskItem>>({});

  // Adding state - which column is showing the add form
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<Partial<TaskItem>>({});

  // Delete confirmation
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Saving state
  const [savingId, setSavingId] = useState<string | null>(null);

  const addTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (addingToColumn && addTitleRef.current) {
      addTitleRef.current.focus();
    }
  }, [addingToColumn]);

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
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: task.status } : t
        )
      );
    }
  }

  // --- Inline Editing ---
  function startEditing(task: TaskItem) {
    setEditingTaskId(task.id);
    setEditForm({ ...task });
    setAddingToColumn(null);
  }

  function cancelEditing() {
    setEditingTaskId(null);
    setEditForm({});
  }

  async function saveEdit() {
    if (!editForm.title?.trim()) return;
    setSavingId(editingTaskId);
    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingTaskId, ...editForm }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setTasks((prev) =>
        prev.map((t) => (t.id === editingTaskId ? data.task : t))
      );
      setEditingTaskId(null);
      setEditForm({});
    } catch {
      console.error("Failed to save task");
    } finally {
      setSavingId(null);
    }
  }

  // --- Add Task ---
  function startAdding(columnKey: string) {
    setAddingToColumn(columnKey);
    setAddForm({ ...emptyTask, status: columnKey });
    setEditingTaskId(null);
  }

  function cancelAdding() {
    setAddingToColumn(null);
    setAddForm({});
  }

  async function saveNewTask() {
    if (!addForm.title?.trim()) return;
    setSavingId("new");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) throw new Error("Failed to create");
      const data = await res.json();
      setTasks((prev) => [...prev, data.task]);
      setAddingToColumn(null);
      setAddForm({});
    } catch {
      console.error("Failed to create task");
    } finally {
      setSavingId(null);
    }
  }

  // --- Delete Task ---
  async function confirmDelete(taskId: string) {
    setSavingId(taskId);
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDeletingTaskId(null);
    } catch {
      console.error("Failed to delete task");
    } finally {
      setSavingId(null);
    }
  }

  // --- Task Card (view mode) ---
  function renderTaskCard(task: TaskItem) {
    const overdue = isOverdue(task.due_date);
    const isDeleting = deletingTaskId === task.id;

    return (
      <div
        key={task.id}
        draggable={!isDeleting}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", task.id);
        }}
        className="group rounded-md border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing relative"
      >
        {/* Delete confirmation overlay */}
        {isDeleting && (
          <div className="absolute inset-0 bg-card/95 rounded-md flex flex-col items-center justify-center gap-2 z-10 p-3">
            <p className="text-sm font-medium text-center">Delete this task?</p>
            <div className="flex gap-2">
              <button
                onClick={() => confirmDelete(task.id)}
                disabled={savingId === task.id}
                className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50"
              >
                {savingId === task.id ? "Deleting..." : "Delete"}
              </button>
              <button
                onClick={() => setDeletingTaskId(null)}
                className="px-3 py-1.5 text-xs font-medium bg-muted rounded-md hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Title row */}
        <div className="flex items-start justify-between gap-1">
          <h4
            className="text-sm font-medium leading-snug cursor-pointer hover:text-orange-600 transition-colors flex-1"
            onClick={() => startEditing(task)}
            title="Click to edit"
          >
            {task.title}
          </h4>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => startEditing(task)}
              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
              title="Edit task"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => setDeletingTaskId(task.id)}
              className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
              title="Delete task"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {task.notion_url && (
              <a
                href={task.notion_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
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
          <div className="flex items-center gap-1">
            {task.assignee ? (
              <span className="text-[11px] text-muted-foreground font-medium">
                {task.assignee}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/50">
                Unassigned
              </span>
            )}
            {task.assignee === "Atlas" && (
              <span title="Will start work automatically"><Bot className="h-3 w-3 text-orange-500" /></span>
            )}
          </div>
          {task.due_date && (
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] ${
                overdue ? "text-red-500" : "text-muted-foreground"
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              {formatDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // --- Task Card (edit mode) ---
  function renderEditForm(task: TaskItem) {
    return (
      <div
        key={task.id}
        className="rounded-md border-2 border-orange-500/50 bg-card p-3 shadow-md space-y-2"
      >
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Title</label>
          <input
            type="text"
            value={editForm.title || ""}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            className="w-full text-sm font-medium bg-background border border-input rounded px-2 py-1.5 mt-0.5"
            autoFocus
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
          <textarea
            value={editForm.notes || ""}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 mt-0.5 resize-none"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Assignee</label>
            <select
              value={editForm.assignee || ""}
              onChange={(e) => setEditForm({ ...editForm, assignee: e.target.value })}
              className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 mt-0.5"
            >
              <option value="">Unassigned</option>
              {ASSIGNEES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {editForm.assignee === "Atlas" && (
              <p className="text-[10px] text-orange-500 mt-0.5 flex items-center gap-1">
                <Bot className="h-3 w-3" /> Will start work automatically
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Priority</label>
            <select
              value={editForm.priority || "medium"}
              onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
              className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 mt-0.5"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
            <select
              value={editForm.type || ""}
              onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 mt-0.5"
            >
              <option value="">None</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Client</label>
            <input
              type="text"
              value={editForm.client || ""}
              onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
              className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 mt-0.5"
              placeholder="Client name"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Project</label>
          <input
            type="text"
            value={editForm.project || ""}
            onChange={(e) => setEditForm({ ...editForm, project: e.target.value })}
            className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 mt-0.5"
            placeholder="Project name"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Tags (comma-separated)</label>
          <input
            type="text"
            value={(editForm.tags || []).join(", ")}
            onChange={(e) =>
              setEditForm({
                ...editForm,
                tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 mt-0.5"
            placeholder="tag1, tag2"
          />
        </div>

        {/* Save / Cancel buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={saveEdit}
            disabled={savingId === editingTaskId || !editForm.title?.trim()}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {savingId === editingTaskId ? "Saving..." : "Save"}
          </button>
          <button
            onClick={cancelEditing}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-muted rounded-md hover:bg-muted/80"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // --- Add Task Form ---
  function renderAddForm(columnKey: string) {
    if (addingToColumn !== columnKey) return null;

    return (
      <div className="rounded-md border-2 border-dashed border-orange-500/40 bg-card p-3 space-y-2">
        <div>
          <input
            ref={addTitleRef}
            type="text"
            value={addForm.title || ""}
            onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
            className="w-full text-sm font-medium bg-background border border-input rounded px-2 py-1.5"
            placeholder="Task title (required)"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveNewTask();
              if (e.key === "Escape") cancelAdding();
            }}
          />
        </div>

        <div>
          <textarea
            value={addForm.notes || ""}
            onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
            className="w-full text-xs bg-background border border-input rounded px-2 py-1.5 resize-none"
            rows={2}
            placeholder="Notes (optional)"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <select
              value={addForm.assignee || ""}
              onChange={(e) => setAddForm({ ...addForm, assignee: e.target.value })}
              className="w-full text-xs bg-background border border-input rounded px-2 py-1.5"
            >
              <option value="">Unassigned</option>
              {ASSIGNEES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {addForm.assignee === "Atlas" && (
              <p className="text-[10px] text-orange-500 mt-0.5 flex items-center gap-1">
                <Bot className="h-3 w-3" /> Will start work automatically
              </p>
            )}
          </div>
          <div>
            <select
              value={addForm.priority || "medium"}
              onChange={(e) => setAddForm({ ...addForm, priority: e.target.value })}
              className="w-full text-xs bg-background border border-input rounded px-2 py-1.5"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={addForm.type || ""}
            onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
            className="w-full text-xs bg-background border border-input rounded px-2 py-1.5"
          >
            <option value="">No type</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <input
            type="text"
            value={addForm.client || ""}
            onChange={(e) => setAddForm({ ...addForm, client: e.target.value })}
            className="w-full text-xs bg-background border border-input rounded px-2 py-1.5"
            placeholder="Client"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={saveNewTask}
            disabled={savingId === "new" || !addForm.title?.trim()}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            {savingId === "new" ? "Adding..." : "Add Task"}
          </button>
          <button
            onClick={cancelAdding}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-muted rounded-md hover:bg-muted/80"
          >
            Cancel
          </button>
        </div>
      </div>
    );
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
        <div className="grid grid-cols-5 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="space-y-3">
              <div className="h-8 bg-muted rounded animate-pulse" />
              <div className="h-24 bg-muted rounded animate-pulse" />
              <div className="h-24 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
          {COLUMNS.map((col) => {
            const colTasks = getColumnTasks(col.key);
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
                  <button
                    onClick={() => startAdding(col.key)}
                    className="text-muted-foreground hover:text-orange-600 transition-colors p-0.5"
                    title={`Add task to ${col.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Column Body */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {/* Add form at top of column */}
                  {renderAddForm(col.key)}

                  {colTasks.length === 0 && addingToColumn !== col.key ? (
                    <div className="flex items-center justify-center h-20">
                      <p className="text-xs text-muted-foreground">No tasks</p>
                    </div>
                  ) : (
                    colTasks.map((task) =>
                      editingTaskId === task.id
                        ? renderEditForm(task)
                        : renderTaskCard(task)
                    )
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
