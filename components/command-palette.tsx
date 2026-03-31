"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Archive,
  Trash2,
  Star,
  Mail,
  Search,
  Clock,
  Reply,
  Forward,
  Check,
  Ban,
  Brain,
  Sparkles,
  FolderOpen,
  Plus,
  Settings,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category: "email" | "navigate" | "ai" | "general";
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
}

export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = actions.filter(
    (a) =>
      a.label.toLowerCase().includes(query.toLowerCase()) ||
      a.description?.toLowerCase().includes(query.toLowerCase()) ||
      a.category.toLowerCase().includes(query.toLowerCase())
  );

  // Group by category
  const grouped = filtered.reduce<Record<string, CommandAction[]>>((acc, action) => {
    if (!acc[action.category]) acc[action.category] = [];
    acc[action.category].push(action);
    return acc;
  }, {});

  const flatFiltered = Object.values(grouped).flat();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatFiltered[selectedIndex]) {
        e.preventDefault();
        flatFiltered[selectedIndex].action();
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [flatFiltered, selectedIndex, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  const categoryLabels: Record<string, string> = {
    email: "Email Actions",
    navigate: "Navigate",
    ai: "AI Features",
    general: "General",
  };

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Command className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto py-2">
          {flatFiltered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No commands found
            </p>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {categoryLabels[category] || category}
                </p>
                {items.map((action) => {
                  const idx = globalIndex++;
                  return (
                    <button
                      key={action.id}
                      data-index={idx}
                      onClick={() => {
                        action.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        idx === selectedIndex
                          ? "bg-muted text-foreground"
                          : "text-foreground/80 hover:bg-muted/50"
                      )}
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {action.icon}
                      </span>
                      <span className="flex-1 text-left">{action.label}</span>
                      {action.shortcut && (
                        <kbd className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">
                          {action.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="border border-border rounded px-1">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-border rounded px-1">↵</kbd> select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-border rounded px-1">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
