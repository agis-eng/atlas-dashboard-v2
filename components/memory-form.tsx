"use client";

import { useState, useEffect } from "react";
import {
  X,
  MessageSquare,
  Lightbulb,
  RefreshCw,
  StickyNote,
  Plus,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MemoryEntry } from "@/lib/redis";

interface MemoryFormProps {
  onSubmit: (data: Partial<MemoryEntry>) => void;
  onCancel: () => void;
  editingEntry?: MemoryEntry | null;
  projects?: { id: string; name: string }[];
  defaultDate?: string;
}

const entryTypes = [
  { value: "note", label: "Note", icon: StickyNote, color: "text-purple-500" },
  { value: "discussion", label: "Discussion", icon: MessageSquare, color: "text-blue-500" },
  { value: "decision", label: "Decision", icon: Lightbulb, color: "text-amber-500" },
  { value: "update", label: "Update", icon: RefreshCw, color: "text-green-500" },
] as const;

export function MemoryForm({
  onSubmit,
  onCancel,
  editingEntry,
  projects = [],
  defaultDate,
}: MemoryFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<MemoryEntry["type"]>("note");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [date, setDate] = useState(
    defaultDate || new Date().toISOString().split("T")[0]
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingEntry) {
      setTitle(editingEntry.title);
      setContent(editingEntry.content);
      setType(editingEntry.type);
      setTags(editingEntry.tags);
      setSelectedProjects(editingEntry.projectIds);
      setDate(editingEntry.date);
    }
  }, [editingEntry]);

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function toggleProject(id: string) {
    setSelectedProjects((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onSubmit({
        ...(editingEntry ? { id: editingEntry.id } : {}),
        title: title.trim(),
        content: content.trim(),
        type,
        tags,
        projectIds: selectedProjects,
        date,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {editingEntry ? "Edit Entry" : "New Entry"}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Title */}
      <Input
        placeholder="What happened?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-sm"
        autoFocus
      />

      {/* Content */}
      <textarea
        placeholder="Details, context, decisions made..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground"
        rows={4}
      />

      {/* Type selector */}
      <div className="flex flex-wrap gap-2">
        {entryTypes.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                type === t.value
                  ? "border-orange-600/50 bg-orange-600/10 text-orange-600"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <Icon className={cn("h-3 w-3", type === t.value ? "text-orange-600" : t.color)} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Date */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Tags</label>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            className="text-xs h-8 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={addTag}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-2 py-0 gap-1 cursor-pointer hover:bg-destructive/20"
                onClick={() => removeTag(tag)}
              >
                {tag}
                <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowProjectPicker(!showProjectPicker)}
          >
            <FolderOpen className="h-3 w-3" />
            Link to projects ({selectedProjects.length})
          </button>
          {showProjectPicker && (
            <div className="grid grid-cols-2 gap-1.5 max-h-[150px] overflow-y-auto rounded-lg border border-border p-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-xs text-left transition-all",
                    selectedProjects.includes(p.id)
                      ? "bg-orange-600/10 text-orange-600 font-medium"
                      : "hover:bg-muted/50"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || submitting}
          className="bg-orange-600 text-white hover:bg-orange-700"
        >
          {submitting
            ? "Saving..."
            : editingEntry
            ? "Update Entry"
            : "Save Entry"}
        </Button>
      </div>
    </form>
  );
}
