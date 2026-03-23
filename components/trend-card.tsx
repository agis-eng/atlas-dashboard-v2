"use client";

import { useState } from "react";
import {
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Heart,
  Eye,
  MessageCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlatformBadge } from "@/components/platform-toggle";
import type { TrendingItem, Topic } from "@/types/trends";

function formatNumber(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface TrendCardProps {
  item: TrendingItem;
  topic?: Topic;
  bookmarked: boolean;
  onBookmark: (item: TrendingItem) => void;
}

export function TrendCard({ item, topic, bookmarked, onBookmark }: TrendCardProps) {
  const [saving, setSaving] = useState(false);

  async function handleBookmark() {
    setSaving(true);
    try {
      await onBookmark(item);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4",
        "hover:border-border/80 hover:shadow-md transition-all duration-200"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <PlatformBadge platform={item.platform} />
          {topic && (
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
              {topic.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(item.timestamp)}
          </span>
        </div>
      </div>

      {/* Thumbnail (YouTube) */}
      {item.thumbnail && (
        <div className="relative overflow-hidden rounded-lg aspect-video bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-medium leading-snug line-clamp-3 text-foreground">
        {item.title}
      </p>

      {/* Author + actions */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <span className="text-xs text-muted-foreground truncate">{item.author}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleBookmark}
            disabled={saving}
            className={cn(
              "p-1 rounded-md transition-colors",
              bookmarked
                ? "text-orange-500"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {bookmarked ? (
              <BookmarkCheck className="h-3.5 w-3.5" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Engagement metrics */}
      <div className="flex items-center gap-3 border-t border-border/50 pt-2 -mx-0.5">
        {item.engagement.likes !== undefined && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Heart className="h-3 w-3" />
            {formatNumber(item.engagement.likes)}
          </span>
        )}
        {item.engagement.views !== undefined && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Eye className="h-3 w-3" />
            {formatNumber(item.engagement.views)}
          </span>
        )}
        {item.engagement.comments !== undefined && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageCircle className="h-3 w-3" />
            {formatNumber(item.engagement.comments)}
          </span>
        )}
      </div>
    </div>
  );
}
