"use client";

import { cn } from "@/lib/utils";

const PLATFORMS = [
  {
    id: "x" as const,
    label: "X",
    color: "bg-zinc-900 text-white border-zinc-700 hover:border-zinc-500",
    activeColor: "bg-zinc-900 text-white border-white",
  },
  {
    id: "reddit" as const,
    label: "Reddit",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20 hover:border-orange-500/50",
    activeColor: "bg-orange-500 text-white border-orange-500",
  },
  {
    id: "youtube" as const,
    label: "YouTube",
    color: "bg-red-500/10 text-red-500 border-red-500/20 hover:border-red-500/50",
    activeColor: "bg-red-500 text-white border-red-500",
  },
] as const;

interface PlatformToggleProps {
  selected: ("x" | "reddit" | "youtube")[];
  onChange: (platforms: ("x" | "reddit" | "youtube")[]) => void;
  size?: "sm" | "default";
}

export function PlatformToggle({ selected, onChange, size = "default" }: PlatformToggleProps) {
  function toggle(id: "x" | "reddit" | "youtube") {
    if (selected.includes(id)) {
      if (selected.length === 1) return; // Keep at least one
      onChange(selected.filter((p) => p !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="flex gap-1.5">
      {PLATFORMS.map((p) => {
        const isActive = selected.includes(p.id);
        return (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={cn(
              "border rounded-md font-medium transition-all",
              size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
              isActive ? p.activeColor : p.color
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

interface PlatformBadgeProps {
  platform: "x" | "reddit" | "youtube";
}

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  const styles = {
    x: "bg-zinc-800 text-zinc-200 border-zinc-700",
    reddit: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    youtube: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  const labels = { x: "X", reddit: "Reddit", youtube: "YouTube" };

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide",
        styles[platform]
      )}
    >
      {labels[platform]}
    </span>
  );
}
