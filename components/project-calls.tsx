"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Film,
  ExternalLink,
  Clock,
  Users,
  Sparkles,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react";

interface Recording {
  id: string;
  title: string;
  date: string;
  duration?: number;
  participants?: string[];
  summary?: string;
  actionItems?: string[];
  transcript?: string;
  url?: string;
  projectId?: string;
  projectName?: string;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ProjectCalls({ projectId }: { projectId: string }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRecordings();
  }, [projectId]);

  async function loadRecordings() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/recordings?projectId=${encodeURIComponent(projectId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (err) {
      console.error("Failed to load project recordings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function unassign(recordingId: string) {
    try {
      await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: null, projectName: null }),
      });
      setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
    } catch {
      alert("Failed to unassign recording");
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Film className="h-4 w-4" /> Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recordings.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Film className="h-4 w-4" /> Calls ({recordings.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recordings.map((rec) => {
          const isExpanded = expanded.has(rec.id);
          return (
            <div
              key={rec.id}
              className="border rounded-lg p-3 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => toggleExpand(rec.id)}
                    className="font-medium text-sm text-left hover:text-orange-600 transition-colors"
                  >
                    {rec.title}
                  </button>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(rec.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {rec.duration ? (
                      <>
                        <span>&middot;</span>
                        <span>{formatDuration(rec.duration)}</span>
                      </>
                    ) : null}
                    {rec.participants && rec.participants.length > 0 && (
                      <>
                        <span>&middot;</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {rec.participants.slice(0, 2).join(", ")}
                          {rec.participants.length > 2 &&
                            ` +${rec.participants.length - 2}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {rec.url && (
                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center h-6 px-1.5 text-xs rounded border border-input bg-background hover:bg-accent"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => toggleExpand(rec.id)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Summary preview */}
              {rec.summary && !isExpanded && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                  {rec.summary}
                </p>
              )}

              {isExpanded && (
                <div className="mt-2 space-y-2">
                  {rec.summary && (
                    <div className="bg-muted/40 rounded p-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Summary
                      </p>
                      <p className="text-xs leading-relaxed">{rec.summary}</p>
                    </div>
                  )}

                  {rec.actionItems && rec.actionItems.length > 0 && (
                    <div className="bg-green-600/10 border border-green-600/20 rounded p-2">
                      <p className="text-xs font-semibold text-green-500 mb-1 flex items-center gap-1">
                        <CheckSquare className="h-3 w-3" /> Action Items
                      </p>
                      <ul className="space-y-0.5">
                        {rec.actionItems.map((item, i) => (
                          <li
                            key={i}
                            className="text-xs flex items-start gap-1.5"
                          >
                            <span className="text-green-500 mt-0.5">
                              &bull;
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rec.transcript && (
                    <div>
                      <p className="text-xs font-medium mb-1">Transcript</p>
                      <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {rec.transcript}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() => unassign(rec.id)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Unassign from project
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
