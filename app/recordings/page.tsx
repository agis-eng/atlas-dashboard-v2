"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Film,
  RefreshCw,
  Search,
  ExternalLink,
  Loader2,
  FolderOpen,
  Clock,
  Users,
  Sparkles,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FathomRecording {
  id: string;
  title: string;
  date: string;
  duration?: number;
  participants?: string[];
  summary?: string;
  actionItems?: string[];
  url?: string;
  projectId?: string;
  projectName?: string;
  status: "pending" | "processed";
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<FathomRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRecordings();
    loadProjects();
  }, []);

  async function loadRecordings() {
    setLoading(true);
    try {
      const res = await fetch("/api/recordings");
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (err) {
      console.error("Failed to load recordings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {}
  }

  async function assignProject(recordingId: string, projectId: string, projectName: string) {
    try {
      await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName }),
      });
      setRecordings((prev) =>
        prev.map((r) => (r.id === recordingId ? { ...r, projectId, projectName } : r))
      );
    } catch {
      alert("Failed to assign project");
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

  const filtered = recordings.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.summary?.toLowerCase().includes(search.toLowerCase()) ||
      r.projectName?.toLowerCase().includes(search.toLowerCase()) ||
      r.participants?.some((p) => p.toLowerCase().includes(search.toLowerCase()))
  );

  const unassigned = filtered.filter((r) => !r.projectId);
  const assigned = filtered.filter((r) => r.projectId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Film className="h-6 w-6 text-orange-600" />
            Fathom Recordings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Call recordings from Fathom — assign to projects
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRecordings}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Webhook Setup Info */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-blue-400 mb-1">📡 Fathom Webhook Setup</p>
          <p className="text-xs text-muted-foreground">
            In Fathom settings → Webhooks, add:{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
              {typeof window !== "undefined" ? window.location.origin : "https://your-app.railway.app"}
              /api/webhooks/fathom
            </code>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            New recordings will appear here automatically after each call.
          </p>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search recordings, summaries, participants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stats */}
      {recordings.length > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{recordings.length} recording{recordings.length !== 1 ? "s" : ""}</span>
          <span>•</span>
          <span>{unassigned.length} unassigned</span>
          <span>•</span>
          <span>{assigned.length} assigned to projects</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : recordings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Film className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">No recordings yet.</p>
            <p className="text-xs text-muted-foreground">
              Set up the Fathom webhook above and recordings will appear here after your calls.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Unassigned */}
          {unassigned.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Needs Assignment ({unassigned.length})
              </h2>
              <div className="space-y-3">
                {unassigned.map((rec) => (
                  <RecordingCard
                    key={rec.id}
                    recording={rec}
                    projects={projects}
                    expanded={expanded.has(rec.id)}
                    onToggleExpand={() => toggleExpand(rec.id)}
                    onAssignProject={assignProject}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Assigned */}
          {assigned.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Assigned to Projects ({assigned.length})
              </h2>
              <div className="space-y-3">
                {assigned.map((rec) => (
                  <RecordingCard
                    key={rec.id}
                    recording={rec}
                    projects={projects}
                    expanded={expanded.has(rec.id)}
                    onToggleExpand={() => toggleExpand(rec.id)}
                    onAssignProject={assignProject}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecordingCard({
  recording,
  projects,
  expanded,
  onToggleExpand,
  onAssignProject,
}: {
  recording: FathomRecording;
  projects: any[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAssignProject: (id: string, projectId: string, projectName: string) => void;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={onToggleExpand}
                className="font-medium text-sm text-left hover:text-orange-600 transition-colors"
              >
                {recording.title}
              </button>
              {recording.projectName && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  <FolderOpen className="h-2.5 w-2.5 mr-1" />
                  {recording.projectName}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(recording.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {recording.duration && (
                <>
                  <span>•</span>
                  <span>{formatDuration(recording.duration)}</span>
                </>
              )}
              {recording.participants && recording.participants.length > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {recording.participants.slice(0, 2).join(", ")}
                    {recording.participants.length > 2 && ` +${recording.participants.length - 2}`}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {recording.url && (
              <a
                href={recording.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open
              </a>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="mt-3 space-y-3">
            {recording.summary && (
              <div className="bg-muted/40 rounded p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Summary
                </p>
                <p className="text-sm">{recording.summary}</p>
              </div>
            )}

            {recording.actionItems && recording.actionItems.length > 0 && (
              <div className="bg-green-600/10 border border-green-600/20 rounded p-3">
                <p className="text-xs font-semibold text-green-500 mb-2 flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" /> Action Items
                </p>
                <ul className="space-y-1">
                  {recording.actionItems.map((item, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Project Assignment */}
        <div className="mt-3 flex items-center gap-2">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select
            className="flex-1 h-7 text-xs rounded border border-border bg-background px-2 text-muted-foreground"
            value={recording.projectId || ""}
            onChange={(e) => {
              const proj = projects.find((p) => p.id === e.target.value);
              if (proj) onAssignProject(recording.id, proj.id, proj.name);
              else onAssignProject(recording.id, "", "");
            }}
          >
            <option value="">Assign to project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={onToggleExpand}
          >
            {expanded ? "Less" : "More"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

