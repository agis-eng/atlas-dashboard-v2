"use client";

import { useState } from "react";
import { Plus, X, Pencil, Check, Trash2, ToggleLeft, ToggleRight, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlatformToggle } from "@/components/platform-toggle";
import { cn } from "@/lib/utils";
import type { Topic } from "@/types/trends";

// AI-suggested topics based on Erik's interests
const AI_SUGGESTIONS = [
  { name: "Next.js & React", keywords: ["nextjs", "react", "app router", "server components"], platforms: ["x", "reddit"] as ("x" | "reddit" | "youtube")[] },
  { name: "AI Product Design", keywords: ["AI UX", "AI product", "LLM product", "AI design"], platforms: ["x", "reddit", "youtube"] as ("x" | "reddit" | "youtube")[] },
  { name: "Indie Hacking", keywords: ["indiehacker", "side project", "bootstrapped", "mrr"], platforms: ["x", "reddit"] as ("x" | "reddit" | "youtube")[] },
  { name: "eBay Reselling", keywords: ["ebay reselling", "flipping", "thrift flip", "arbitrage"], platforms: ["reddit", "youtube"] as ("x" | "reddit" | "youtube")[] },
  { name: "TypeScript", keywords: ["typescript", "type safety", "ts generics"], platforms: ["x", "reddit"] as ("x" | "reddit" | "youtube")[] },
  { name: "Growth Marketing", keywords: ["growth marketing", "SEO", "content marketing", "acquisition"], platforms: ["x", "reddit"] as ("x" | "reddit" | "youtube")[] },
];

interface TopicManagerProps {
  topics: Topic[];
  onTopicsChange: (topics: Topic[]) => void;
}

export function TopicManager({ topics, onTopicsChange }: TopicManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newPlatforms, setNewPlatforms] = useState<("x" | "reddit" | "youtube")[]>(["x", "reddit", "youtube"]);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setNewName("");
    setNewKeywords("");
    setNewPlatforms(["x", "reddit", "youtube"]);
    setShowForm(false);
    setEditingId(null);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/trends/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          keywords: newKeywords.split(",").map((k) => k.trim()).filter(Boolean),
          platforms: newPlatforms,
        }),
      });
      const data = await res.json();
      if (data.topic) {
        onTopicsChange([...topics, data.topic]);
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(topic: Topic) {
    const res = await fetch("/api/trends/topics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: topic.id, active: !topic.active }),
    });
    const data = await res.json();
    if (data.topic) {
      onTopicsChange(topics.map((t) => (t.id === topic.id ? data.topic : t)));
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/trends/topics?id=${id}`, { method: "DELETE" });
    onTopicsChange(topics.filter((t) => t.id !== id));
  }

  async function addSuggestion(s: typeof AI_SUGGESTIONS[number]) {
    const res = await fetch("/api/trends/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.name, keywords: s.keywords, platforms: s.platforms }),
    });
    const data = await res.json();
    if (data.topic) {
      onTopicsChange([...topics, data.topic]);
    }
  }

  const existingNames = new Set(topics.map((t) => t.name.toLowerCase()));
  const availableSuggestions = AI_SUGGESTIONS.filter(
    (s) => !existingNames.has(s.name.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Topics</h2>
        <div className="flex gap-2">
          {availableSuggestions.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
              onClick={() => setShowSuggestions(!showSuggestions)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Suggest
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {/* AI Suggestions */}
      {showSuggestions && availableSuggestions.length > 0 && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
          <p className="text-xs font-medium text-orange-500 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            AI-suggested topics for you
          </p>
          <div className="flex flex-wrap gap-2">
            {availableSuggestions.map((s) => (
              <button
                key={s.name}
                onClick={() => addSuggestion(s)}
                className="px-2.5 py-1 text-xs rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors"
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Input
            placeholder="Topic name (e.g. AI & Machine Learning)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-sm"
          />
          <Input
            placeholder="Keywords (comma-separated)"
            value={newKeywords}
            onChange={(e) => setNewKeywords(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Platforms</p>
            <PlatformToggle selected={newPlatforms} onChange={setNewPlatforms} size="sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={saving || !newName.trim()}>
              {saving ? "Saving…" : "Add Topic"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Topic list */}
      <div className="space-y-2">
        {topics.map((topic) => (
          <div
            key={topic.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              topic.active
                ? "border-border bg-card"
                : "border-border/50 bg-muted/30 opacity-60"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{topic.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {topic.keywords.slice(0, 3).join(", ")}
                {topic.keywords.length > 3 && ` +${topic.keywords.length - 3}`}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleToggle(topic)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {topic.active ? (
                  <ToggleRight className="h-4 w-4 text-orange-500" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => handleDelete(topic.id)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {topics.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No topics yet. Add one above or use AI suggestions.
          </p>
        )}
      </div>
    </div>
  );
}
