"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mic,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Users,
  ListChecks,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceMemo {
  id: string;
  title: string;
  date: string;
  type: string;
  speakers: string;
  projectMatch: string | null;
  clientMatch?: string | null;
  summary: string;
  notionUrl: string;
  topics: string[];
  actionItems: string[];
  source?: "processed" | "processed-local" | "icloud";
  fileSize?: number;
  transcript?: string;
  sentiment?: string;
  keyDecisions?: string[];
  mentionedPeople?: string[];
  processedAt?: string;
}

export default function VoiceMemosPage() {
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadMemos();
  }, []);

  async function loadMemos() {
    setLoading(true);
    try {
      const res = await fetch("/api/voice-memos");
      if (res.ok) {
        const data = await res.json();
        setMemos(data.memos || []);
      }
    } catch (err) {
      console.error("Failed to load voice memos:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = memos.filter((m) => {
    const matchesSearch =
      !search ||
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.summary.toLowerCase().includes(search.toLowerCase()) ||
      m.speakers.toLowerCase().includes(search.toLowerCase()) ||
      m.topics.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesType = typeFilter === "all" || m.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const businessCount = memos.filter((m) => m.type === "business").length;
  const personalCount = memos.filter((m) => m.type === "personal").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mic className="h-6 w-6 text-orange-600" />
            Voice Memos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {memos.length} memos — {businessCount} business, {personalCount} personal
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMemos}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search memos, speakers, topics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {["all", "business", "personal"].map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeFilter === t ? "default" : "outline"}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "capitalize",
                typeFilter === t && "bg-orange-600 hover:bg-orange-700 text-white"
              )}
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      {/* Memos List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mic className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              {memos.length === 0
                ? "No voice memos found."
                : "No memos match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((memo) => {
            const expanded = expandedId === memo.id;
            return (
              <Card
                key={memo.id}
                className="transition-shadow hover:shadow-md cursor-pointer"
                onClick={() => setExpandedId(expanded ? null : memo.id)}
              >
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-medium text-sm">{memo.title}</h3>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs shrink-0",
                            memo.type === "business"
                              ? "bg-blue-500/10 text-blue-600"
                              : "bg-green-500/10 text-green-600"
                          )}
                        >
                          {memo.type}
                        </Badge>
                        {memo.source === "icloud" && (
                          <Badge variant="secondary" className="text-xs shrink-0 bg-orange-500/10 text-orange-600">
                            Unprocessed
                          </Badge>
                        )}
                        {memo.source === "processed-local" && (
                          <Badge variant="secondary" className="text-xs shrink-0 bg-purple-500/10 text-purple-600">
                            AI Processed
                          </Badge>
                        )}
                        {memo.clientMatch && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {memo.clientMatch}
                          </Badge>
                        )}
                        {memo.sentiment && memo.sentiment !== "neutral" && (
                          <Badge variant="secondary" className={cn(
                            "text-xs shrink-0",
                            memo.sentiment === "positive" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                          )}>
                            {memo.sentiment}
                          </Badge>
                        )}
                        {memo.projectMatch && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {memo.projectMatch}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{new Date(memo.date).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {memo.speakers}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {memo.notionUrl && (
                        <a
                          href={memo.notionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Summary (always visible) */}
                  <p className={cn(
                    "text-xs text-muted-foreground mt-2 leading-relaxed",
                    !expanded && "line-clamp-2"
                  )}>
                    {memo.summary}
                  </p>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="mt-3 space-y-3">
                      {/* Topics */}
                      {memo.topics.length > 0 && (
                        <div>
                          <p className="text-xs font-medium flex items-center gap-1 mb-1.5">
                            <Tag className="h-3 w-3" />
                            Topics
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {memo.topics.map((topic, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-normal">
                                {topic}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Items */}
                      {memo.actionItems.length > 0 && (
                        <div>
                          <p className="text-xs font-medium flex items-center gap-1 mb-1.5">
                            <ListChecks className="h-3 w-3" />
                            Action Items ({memo.actionItems.length})
                          </p>
                          <ul className="space-y-1">
                            {memo.actionItems.map((item, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                                <span className="text-muted-foreground/50 shrink-0">-</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Key Decisions */}
                      {memo.keyDecisions && memo.keyDecisions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1.5">Key Decisions</p>
                          <ul className="space-y-1">
                            {memo.keyDecisions.map((d, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                                <span className="text-green-500 shrink-0">-</span>
                                {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* People Mentioned */}
                      {memo.mentionedPeople && memo.mentionedPeople.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1.5">People Mentioned</p>
                          <div className="flex flex-wrap gap-1.5">
                            {memo.mentionedPeople.map((p, i) => (
                              <Badge key={i} variant="outline" className="text-xs font-normal">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transcript */}
                      {memo.transcript && (
                        <div>
                          <p className="text-xs font-medium mb-1.5">Transcript</p>
                          <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                            {memo.transcript}
                          </div>
                        </div>
                      )}

                      {/* Processing info */}
                      {memo.processedAt && (
                        <p className="text-[10px] text-muted-foreground/50">
                          Processed {new Date(memo.processedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
