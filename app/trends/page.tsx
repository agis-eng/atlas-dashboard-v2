"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  Search,
  Download,
  TrendingUp,
  Bookmark,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendCard } from "@/components/trend-card";
import { TopicManager } from "@/components/topic-manager";
import { PlatformToggle } from "@/components/platform-toggle";
import { cn } from "@/lib/utils";
import type { Topic, TrendingItem } from "@/types/trends";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

type EngagementFilter = "all" | "high" | "medium" | "low";

function meetsEngagement(item: TrendingItem, filter: EngagementFilter): boolean {
  if (filter === "all") return true;
  const total =
    (item.engagement.likes ?? 0) +
    (item.engagement.views ?? 0) * 0.01 +
    (item.engagement.comments ?? 0) * 2;
  if (filter === "high") return total >= 500;
  if (filter === "medium") return total >= 100 && total < 500;
  return total < 100;
}

export default function TrendsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<("x" | "reddit" | "youtube")[]>(["x", "reddit", "youtube"]);
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>("all");
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [groupByTopic, setGroupByTopic] = useState(true);
  const [isMock, setIsMock] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTopics = useCallback(async () => {
    const res = await fetch("/api/trends/topics");
    const data = await res.json();
    setTopics(data.topics || []);
    return data.topics as Topic[];
  }, []);

  const loadBookmarks = useCallback(async () => {
    const res = await fetch("/api/trends/bookmarks");
    const data = await res.json();
    setBookmarkedIds(new Set((data.bookmarks || []).map((b: { itemId: string }) => b.itemId)));
  }, []);

  const fetchTrends = useCallback(async (showLoader = false) => {
    if (showLoader) setRefreshing(true);
    try {
      const res = await fetch("/api/trends");
      const data = await res.json();
      setItems(data.items || []);
      setIsMock(true); // Will be false when real APIs are connected
      setLastRefresh(new Date());
    } finally {
      if (showLoader) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadTopics(), loadBookmarks(), fetchTrends()]);
      setLoading(false);
    }
    init();
  }, [loadTopics, loadBookmarks, fetchTrends]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    timerRef.current = setInterval(() => fetchTrends(true), REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchTrends]);

  async function handleBookmark(item: TrendingItem) {
    const isBookmarked = bookmarkedIds.has(item.id);
    if (isBookmarked) {
      await fetch(`/api/trends/bookmarks?itemId=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      setBookmarkedIds((prev) => { const s = new Set(prev); s.delete(item.id); return s; });
    } else {
      await fetch("/api/trends/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      setBookmarkedIds((prev) => new Set(prev).add(item.id));
    }
  }

  function handleExport() {
    const filtered = getFilteredItems();
    const csv = [
      ["Platform", "Topic", "Title", "Author", "URL", "Likes", "Views", "Comments", "Timestamp"].join(","),
      ...filtered.map((item) =>
        [
          item.platform,
          topics.find((t) => t.id === item.topicId)?.name ?? "",
          `"${item.title.replace(/"/g, '""')}"`,
          item.author,
          item.url,
          item.engagement.likes ?? "",
          item.engagement.views ?? "",
          item.engagement.comments ?? "",
          item.timestamp,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trends-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getFilteredItems(): TrendingItem[] {
    return items.filter((item) => {
      if (showBookmarksOnly && !bookmarkedIds.has(item.id)) return false;
      if (!platformFilter.includes(item.platform)) return false;
      if (topicFilter !== "all" && item.topicId !== topicFilter) return false;
      if (!meetsEngagement(item, engagementFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.title.toLowerCase().includes(q) && !item.author.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  const filtered = getFilteredItems();

  // Group by topic
  const grouped: Record<string, TrendingItem[]> = {};
  if (groupByTopic) {
    for (const item of filtered) {
      if (!grouped[item.topicId]) grouped[item.topicId] = [];
      grouped[item.topicId].push(item);
    }
  }

  const topicMap = Object.fromEntries(topics.map((t) => [t.id, t]));

  function timeLabel() {
    if (!lastRefresh) return null;
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  }

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar — topic manager */}
      <aside
        className={cn(
          "border-r border-border bg-card/50 flex flex-col transition-all duration-300 shrink-0",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        )}
      >
        <div className="p-4 overflow-y-auto flex-1">
          <TopicManager
            topics={topics}
            onTopicsChange={(updated) => {
              setTopics(updated);
              fetchTrends(true);
            }}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
          {/* Sidebar toggle */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>

          {/* Page title */}
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <h1 className="font-semibold text-sm">Trends</h1>
            {isMock && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 font-medium">
                MOCK
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm min-w-32">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search trends…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Platform filter */}
          <PlatformToggle selected={platformFilter} onChange={setPlatformFilter} size="sm" />

          {/* Topic filter */}
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="h-8 text-sm rounded-md border border-border bg-background px-2 text-foreground"
          >
            <option value="all">All topics</option>
            {topics.filter((t) => t.active).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Engagement filter */}
          <select
            value={engagementFilter}
            onChange={(e) => setEngagementFilter(e.target.value as EngagementFilter)}
            className="h-8 text-sm rounded-md border border-border bg-background px-2 text-foreground"
          >
            <option value="all">Any engagement</option>
            <option value="high">High engagement</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Bookmarks toggle */}
          <Button
            size="sm"
            variant={showBookmarksOnly ? "secondary" : "ghost"}
            className={cn("h-8 gap-1.5 text-xs", showBookmarksOnly && "text-orange-500")}
            onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
          >
            <Bookmark className="h-3.5 w-3.5" />
            Saved
          </Button>

          {/* Group toggle */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setGroupByTopic(!groupByTopic)}
          >
            {groupByTopic ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {groupByTopic ? "Grouped" : "All"}
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Last refresh */}
          {lastRefresh && (
            <span className="text-xs text-muted-foreground shrink-0">
              Updated {timeLabel()}
            </span>
          )}

          {/* Refresh */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => fetchTrends(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>

          {/* Export */}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 space-y-8 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No trends found</p>
              <p className="text-xs text-muted-foreground/60">
                {topics.filter((t) => t.active).length === 0
                  ? "Add some topics to start tracking trends"
                  : "Try adjusting your filters"}
              </p>
            </div>
          ) : groupByTopic ? (
            Object.entries(grouped).map(([topicId, topicItems]) => {
              const topic = topicMap[topicId];
              if (!topic) return null;
              return (
                <section key={topicId}>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-sm font-semibold">{topic.name}</h2>
                    <span className="text-xs text-muted-foreground">{topicItems.length} items</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {topicItems.map((item, i) => (
                      <div
                        key={item.id}
                        style={{ transitionDelay: `${i * 30}ms` }}
                        className="opacity-0 translate-y-2 animate-[fadeInUp_0.3s_ease_forwards]"
                      >
                        <TrendCard
                          item={item}
                          topic={topic}
                          bookmarked={bookmarkedIds.has(item.id)}
                          onBookmark={handleBookmark}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((item, i) => (
                <div
                  key={item.id}
                  style={{ transitionDelay: `${i * 20}ms` }}
                  className="opacity-0 translate-y-2 animate-[fadeInUp_0.3s_ease_forwards]"
                >
                  <TrendCard
                    item={item}
                    topic={topicMap[item.topicId]}
                    bookmarked={bookmarkedIds.has(item.id)}
                    onBookmark={handleBookmark}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
