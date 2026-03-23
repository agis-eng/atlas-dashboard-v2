"use client";

import { useState } from "react";
import {
  MessageSquare,
  Lightbulb,
  RefreshCw,
  StickyNote,
  Pencil,
  Trash2,
  Link2,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MemoryEntry } from "@/lib/redis";

interface MemoryEntryCardProps {
  entry: MemoryEntry;
  onEdit: (entry: MemoryEntry) => void;
  onDelete: (id: string) => void;
  projects?: { id: string; name: string }[];
}

const typeConfig = {
  discussion: {
    icon: MessageSquare,
    label: "Discussion",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  decision: {
    icon: Lightbulb,
    label: "Decision",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  update: {
    icon: RefreshCw,
    label: "Update",
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  note: {
    icon: StickyNote,
    label: "Note",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
};

export function MemoryEntryCard({
  entry,
  onEdit,
  onDelete,
  projects = [],
}: MemoryEntryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const config = typeConfig[entry.type] || typeConfig.note;
  const TypeIcon = config.icon;

  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const linkedProjects = projects.filter((p) =>
    entry.projectIds.includes(p.id)
  );

  const contentPreview =
    entry.content.length > 200 && !expanded
      ? entry.content.slice(0, 200) + "..."
      : entry.content;

  return (
    <div className="group relative rounded-xl border border-border bg-card p-4 transition-all hover:shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            config.bg
          )}
        >
          <TypeIcon className={cn("h-4 w-4", config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{entry.title}</h3>
            <Badge
              variant="outline"
              className={cn("text-[10px] shrink-0", config.color)}
            >
              {config.label}
            </Badge>
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{time}</span>
            <span className="text-muted-foreground/40">|</span>
            <span>{entry.author}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(entry)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          {confirmDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                onDelete(entry.id);
                setConfirmDelete(false);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 3000);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {entry.content && (
        <div className="mt-3 ml-11">
          <p
            className={cn(
              "text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed",
              entry.content.length > 200 && "cursor-pointer"
            )}
            onClick={() => {
              if (entry.content.length > 200) setExpanded(!expanded);
            }}
          >
            {contentPreview}
          </p>
          {entry.content.length > 200 && (
            <button
              className="text-xs text-orange-600 mt-1 hover:underline"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Tags & Projects */}
      {(entry.tags.length > 0 || linkedProjects.length > 0) && (
        <div className="mt-3 ml-11 flex flex-wrap items-center gap-1.5">
          {entry.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px] px-2 py-0"
            >
              {tag}
            </Badge>
          ))}
          {linkedProjects.map((p) => (
            <Badge
              key={p.id}
              variant="outline"
              className="text-[10px] px-2 py-0 gap-1"
            >
              <Link2 className="h-2.5 w-2.5" />
              {p.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
