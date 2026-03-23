"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Search,
  Calendar,
  List,
  Download,
  FileJson,
  FileText,
  BookOpen,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MemoryCalendar } from "@/components/memory-calendar";
import { MemoryEntryCard } from "@/components/memory-entry";
import { MemoryForm } from "@/components/memory-form";
import type { MemoryEntry } from "@/lib/redis";

type ViewMode = "timeline" | "calendar";

interface Project {
  id: string;
  name: string;
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [datesWithEntries, setDatesWithEntries] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [filterTag, setFilterTag] = useState<string>("");
  const [filterAuthor, setFilterAuthor] = useState<string>("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MemoryEntry | null>(null);

  // Export dropdown
  const [showExport, setShowExport] = useState(false);

  const loadEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.set("date", selectedDate);
      if (filterType) params.set("type", filterType);
      if (filterTag) params.set("tag", filterTag);
      if (filterAuthor) params.set("author", filterAuthor);

      const res = await fetch(`/api/memory?${params}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setDatesWithEntries(data.datesWithEntries || []);
      setAllTags(data.tags || []);
    } catch (err) {
      console.error("Failed to load memory entries:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filterType, filterTag, filterAuthor]);

  useEffect(() => {
    setMounted(true);
    loadEntries();
    loadProjects();
  }, [loadEntries]);

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(
        (data.projects || []).map((p: any) => ({ id: p.id, name: p.name }))
      );
    } catch {
      // Projects are optional
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/memory/search?q=${encodeURIComponent(searchQuery)}&limit=50`
      );
      const data = await res.json();
      setSearchResults(data.entries || []);
    } catch {
      console.error("Search failed");
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchResults(null);
  }

  async function handleSubmit(data: Partial<MemoryEntry>) {
    try {
      const method = data.id ? "PUT" : "POST";
      const res = await fetch("/api/memory", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setShowForm(false);
        setEditingEntry(null);
        await loadEntries();
      }
    } catch (err) {
      console.error("Failed to save entry:", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadEntries();
      }
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  }

  function handleEdit(entry: MemoryEntry) {
    setEditingEntry(entry);
    setShowForm(true);
  }

  async function handleExport(format: "markdown" | "json") {
    setShowExport(false);
    const params = new URLSearchParams({ format });
    if (selectedDate) {
      params.set("from", selectedDate);
      params.set("to", selectedDate);
    }
    window.open(`/api/memory/export?${params}`, "_blank");
  }

  // Group entries by date for timeline
  const displayEntries = searchResults ?? entries;
  const groupedByDate = new Map<string, MemoryEntry[]>();
  for (const entry of displayEntries) {
    const existing = groupedByDate.get(entry.date) || [];
    existing.push(entry);
    groupedByDate.set(entry.date, existing);
  }
  const sortedDates = [...groupedByDate.keys()].sort().reverse();

  function formatDateHeading(dateStr: string): string {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];
    if (dateStr === today) return "Today";
    if (dateStr === yesterday) return "Yesterday";
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  const activeFilters =
    (filterType ? 1 : 0) + (filterTag ? 1 : 0) + (filterAuthor ? 1 : 0);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-orange-600" />
            Memory
          </h1>
          <p className="text-muted-foreground mt-1">
            Daily log of discussions, decisions, and updates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              onClick={() => setViewMode("timeline")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "timeline"
                  ? "bg-orange-600/10 text-orange-600"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5 inline mr-1.5" />
              Timeline
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "calendar"
                  ? "bg-orange-600/10 text-orange-600"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calendar className="h-3.5 w-3.5 inline mr-1.5" />
              Calendar
            </button>
          </div>

          {/* Export */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExport(!showExport)}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
            {showExport && (
              <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 p-1 min-w-[140px]">
                <button
                  onClick={() => handleExport("markdown")}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Markdown
                </button>
                <button
                  onClick={() => handleExport("json")}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  JSON
                </button>
              </div>
            )}
          </div>

          {/* New Entry */}
          <Button
            size="sm"
            className="bg-orange-600 text-white hover:bg-orange-700"
            onClick={() => {
              setEditingEntry(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div
        className={`space-y-3 transition-all duration-500 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
        style={{ transitionDelay: "100ms" }}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entries... (press Enter)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
                if (e.key === "Escape") clearSearch();
              }}
              className="pl-9 text-sm"
            />
            {searchResults !== null && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(activeFilters > 0 && "border-orange-600/50 text-orange-600")}
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Filters
            {activeFilters > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {activeFilters}
              </Badge>
            )}
          </Button>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-md border border-border bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All</option>
                <option value="note">Note</option>
                <option value="discussion">Discussion</option>
                <option value="decision">Decision</option>
                <option value="update">Update</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Tag</label>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="rounded-md border border-border bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Author</label>
              <select
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                className="rounded-md border border-border bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All</option>
                <option value="Erik">Erik</option>
                <option value="Anton">Anton</option>
              </select>
            </div>

            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  setFilterType("");
                  setFilterTag("");
                  setFilterAuthor("");
                }}
              >
                Clear all
              </Button>
            )}
          </div>
        )}

        {/* Search result indicator */}
        {searchResults !== null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            {searching ? (
              "Searching..."
            ) : (
              <>
                Found {searchResults.length} result
                {searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
              </>
            )}
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div
          className="transition-all duration-300"
          style={{ transitionDelay: "50ms" }}
        >
          <MemoryForm
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingEntry(null);
            }}
            editingEntry={editingEntry}
            projects={projects}
            defaultDate={selectedDate || undefined}
          />
        </div>
      )}

      {/* Main content */}
      <div
        className={`transition-all duration-500 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
        style={{ transitionDelay: "200ms" }}
      >
        {viewMode === "calendar" ? (
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            {/* Calendar sidebar */}
            <div>
              <MemoryCalendar
                datesWithEntries={datesWithEntries}
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  setSearchResults(null);
                }}
              />

              {/* Stats card */}
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total entries</span>
                    <span className="font-semibold">{entries.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Days logged</span>
                    <span className="font-semibold">
                      {datesWithEntries.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tags used</span>
                    <span className="font-semibold">{allTags.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Entries for selected date or all */}
            <div className="space-y-3">
              {selectedDate && (
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {formatDateHeading(selectedDate)}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setSelectedDate(null)}
                  >
                    Show all
                  </Button>
                </div>
              )}

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-24 rounded-xl border border-border bg-muted/30 animate-pulse"
                    />
                  ))}
                </div>
              ) : displayEntries.length === 0 ? (
                <EmptyState
                  selectedDate={selectedDate}
                  onAddEntry={() => setShowForm(true)}
                />
              ) : (
                displayEntries.map((entry) => (
                  <MemoryEntryCard
                    key={entry.id}
                    entry={entry}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    projects={projects}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          /* Timeline view */
          <div className="space-y-8">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 rounded-xl border border-border bg-muted/30 animate-pulse"
                  />
                ))}
              </div>
            ) : sortedDates.length === 0 ? (
              <EmptyState
                selectedDate={selectedDate}
                onAddEntry={() => setShowForm(true)}
              />
            ) : (
              sortedDates.map((date) => (
                <div key={date}>
                  {/* Date heading with line */}
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
                      {formatDateHeading(date)}
                    </h2>
                    <div className="flex-1 h-px bg-border" />
                    <Badge
                      variant="outline"
                      className="text-[10px] shrink-0"
                    >
                      {groupedByDate.get(date)?.length || 0} entries
                    </Badge>
                  </div>

                  <div className="space-y-3 ml-0 md:ml-4">
                    {groupedByDate.get(date)?.map((entry) => (
                      <MemoryEntryCard
                        key={entry.id}
                        entry={entry}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        projects={projects}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  selectedDate,
  onAddEntry,
}: {
  selectedDate: string | null;
  onAddEntry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-orange-600/10 flex items-center justify-center mb-4">
        <BookOpen className="h-6 w-6 text-orange-600" />
      </div>
      <h3 className="text-sm font-semibold">No entries yet</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-[300px]">
        {selectedDate
          ? "Nothing logged for this day. Add your first entry."
          : "Start logging discussions, decisions, and updates."}
      </p>
      <Button
        size="sm"
        className="mt-4 bg-orange-600 text-white hover:bg-orange-700"
        onClick={onAddEntry}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add first entry
      </Button>
    </div>
  );
}
