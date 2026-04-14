"use client";

import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Youtube,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Brain,
  Sparkles,
  Clock,
  Eye,
  ThumbsUp,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface SearchResult {
  id: string;
  platform: "youtube";
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  author: string;
  publishedAt: string;
  engagement: {
    views?: number;
    likes?: number;
    comments?: number;
  };
  duration?: string;
}

function formatNumber(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 365) return `${Math.floor(days / 365)}y ago`;
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

export default function ResearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState("");
  const [ingestResult, setIngestResult] = useState<{
    success?: boolean;
    brainId?: string;
    count?: number;
    errors?: string[];
  } | null>(null);
  const [searchHistory, setSearchHistory] = useState<Array<{ query: string; results: SearchResult[]; timestamp: string }>>([]);

  // Load last search from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("research-history");
      if (saved) {
        const history = JSON.parse(saved);
        setSearchHistory(history);
        // Restore the most recent search
        if (history.length > 0) {
          const latest = history[0];
          setQuery(latest.query);
          setResults(latest.results);
        }
      }
    } catch { /* ignore */ }
  }, []);

  function saveSearch(q: string, r: SearchResult[]) {
    const entry = { query: q, results: r, timestamp: new Date().toISOString() };
    const updated = [entry, ...searchHistory.filter((h) => h.query !== q)].slice(0, 10);
    setSearchHistory(updated);
    localStorage.setItem("research-history", JSON.stringify(updated));
  }

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    setSelected(new Set());
    setIngestResult(null);

    try {
      const params = new URLSearchParams({ q: query, max: "15" });
      const res = await fetch(`/api/research/search?${params}`);
      const data = await res.json();

      if (data.error) {
        setSearchError(data.error);
      } else {
        const r = data.results || [];
        setResults(r);
        if (r.length) saveSearch(query, r);
        if (data.errors?.length) {
          setSearchError(data.errors.join("; "));
        }
      }
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [query]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filteredResults.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredResults.map((r) => r.id)));
    }
  }

  async function ingestSelected() {
    if (!selected.size) return;
    setIngesting(true);
    setIngestStatus("Preparing...");
    setIngestResult(null);

    const items = results
      .filter((r) => selected.has(r.id))
      .map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        author: r.author,
        videoId: r.id.replace("yt-", ""),
      }));

    setIngestStatus(`Transcribing ${items.length} videos...`);

    try {
      const res = await fetch("/api/research/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: query, items }),
      });
      const data = await res.json();

      if (data.success) {
        setIngestResult({
          success: true,
          brainId: data.brainId,
          count: data.documentsIngested,
          errors: data.errors,
        });
      } else {
        setIngestResult({
          success: false,
          errors: data.details || [data.error || "Ingestion failed"],
        });
      }
    } catch {
      setIngestResult({ success: false, errors: ["Ingestion failed. Please try again."] });
    } finally {
      setIngesting(false);
      setIngestStatus("");
    }
  }

  const filteredResults = results;

  const selectedCount = selected.size;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-orange-600" />
          Research
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search YouTube and Reddit, ingest transcripts and posts into a Brain, then chat with AI to create plans and summaries.
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search a topic... (e.g., grant writing, dropshipping, AI automation)"
            className="pl-9 h-11"
          />
        </div>
        <Button
          onClick={search}
          disabled={searching || !query.trim()}
          className="h-11 px-6 bg-orange-600 hover:bg-orange-700"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-2">Search</span>
        </Button>
      </div>

      {searchError && (
        <p className="text-xs text-yellow-500">{searchError}</p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                className="text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                {selected.size === filteredResults.length ? "Deselect All" : "Select All"}
              </button>
              <span className="text-xs text-muted-foreground">
                {results.length} videos found
              </span>
            </div>

            {selected.size > 0 && (
              <Button
                onClick={ingestSelected}
                disabled={ingesting}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {ingesting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Brain className="h-4 w-4 mr-2" />
                )}
                {ingesting
                  ? ingestStatus
                  : `Create Brain from ${selectedCount} videos`}
              </Button>
            )}
          </div>

          {/* Result Cards */}
          <div className="grid gap-3">
            {filteredResults.map((result) => {
              const isSelected = selected.has(result.id);
              return (
                <div
                  key={result.id}
                  onClick={() => toggleSelect(result.id)}
                  className={cn(
                    "flex gap-4 p-4 rounded-lg border cursor-pointer transition-all",
                    isSelected
                      ? "border-orange-600 bg-orange-600/5 ring-1 ring-orange-600/20"
                      : "border-border bg-card hover:border-foreground/20"
                  )}
                >
                  {/* Checkbox */}
                  <div className="flex items-start pt-1">
                    <div
                      className={cn(
                        "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "border-orange-600 bg-orange-600"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  {/* Thumbnail */}
                  {result.thumbnail && (
                    <div className="shrink-0 w-40 h-24 rounded overflow-hidden bg-muted">
                      <img
                        src={result.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {result.duration && (
                        <div className="relative -mt-6 ml-1">
                          <span className="bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">
                            {result.duration}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <Youtube className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm line-clamp-2">{result.title}</h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{result.author}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(result.publishedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                          {result.engagement.views !== undefined && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {formatNumber(result.engagement.views)}
                            </span>
                          )}
                          {result.engagement.likes !== undefined && (
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" />
                              {formatNumber(result.engagement.likes)}
                            </span>
                          )}
                          {result.engagement.comments !== undefined && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {formatNumber(result.engagement.comments)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* External link */}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Ingest Result */}
      {ingestResult && (
        <div
          className={cn(
            "rounded-lg border p-6 space-y-3",
            ingestResult.success
              ? "border-green-500/30 bg-green-500/5"
              : "border-red-500/30 bg-red-500/5"
          )}
        >
          {ingestResult.success ? (
            <>
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="font-semibold">
                  Brain created with {ingestResult.count} sources!
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                All transcripts and posts have been loaded. You can now chat with the AI to analyze everything.
              </p>
              {ingestResult.errors?.length ? (
                <div className="text-xs text-yellow-500 space-y-1">
                  <p className="font-medium">Some items couldn't be ingested:</p>
                  {ingestResult.errors.map((err, i) => (
                    <p key={i}>- {err}</p>
                  ))}
                </div>
              ) : null}
              <Button
                onClick={() => router.push(`/brain/${ingestResult.brainId}`)}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Brain className="h-4 w-4 mr-2" />
                Open Brain & Chat
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          ) : (
            <>
              <h3 className="font-semibold text-red-500">Ingestion failed</h3>
              {ingestResult.errors?.map((err, i) => (
                <p key={i} className="text-sm text-red-400">- {err}</p>
              ))}
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {!searching && !results.length && !ingestResult && (
        <div className="text-center py-20 space-y-4">
          <Sparkles className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <div>
            <h2 className="text-lg font-semibold">Search any topic</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Enter a topic to search YouTube videos and Reddit posts. Select the best results,
              and we'll transcribe everything into a Brain you can chat with.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {["Grant writing process", "eBay reselling tips", "AI automation for business", "Dropshipping 2026"].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => { setQuery(suggestion); }}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-orange-600/50 hover:text-orange-600 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {searchHistory.length > 0 && (
            <div className="mt-8 max-w-md mx-auto">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Searches</h3>
              <div className="space-y-2">
                {searchHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuery(h.query);
                      setResults(h.results);
                    }}
                    className="w-full text-left flex items-center justify-between px-4 py-2.5 rounded-lg border border-border hover:border-orange-600/50 transition-colors"
                  >
                    <div>
                      <span className="text-sm font-medium">{h.query}</span>
                      <span className="text-xs text-muted-foreground ml-2">{h.results.length} videos</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{timeAgo(h.timestamp)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
