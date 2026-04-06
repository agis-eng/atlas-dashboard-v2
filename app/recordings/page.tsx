"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Trash2,
  Download,
  ChevronDown,
  ChevronUp,
  Check,
  Mail,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

/** Strip Fathom video links from markdown — they clutter the summary */
function cleanSummary(text: string): string {
  // Remove [text](https://fathom.video/...) → keep just text
  return text.replace(/\[([^\]]*)\]\(https?:\/\/fathom\.video[^)]*\)/g, "$1");
}

interface FathomRecording {
  id: string;
  title: string;
  date: string;
  duration?: number;
  participants?: string[];
  attendeeEmails?: string[];
  summary?: string;
  actionItems?: string[];
  url?: string;
  projectId?: string;
  projectName?: string;
  suggestedProjectId?: string;
  suggestedProjectName?: string;
  matchConfidence?: "high" | "medium" | null;
  status: "pending" | "processed";
  source?: "webhook" | "api-sync";
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    apiKeyConfigured: boolean;
    lastSyncAt: string | null;
    totalRecordings: number;
  } | null>(null);

  useEffect(() => {
    loadRecordings();
    loadProjects();
    loadSyncStatus();
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

  async function loadSyncStatus() {
    try {
      const res = await fetch("/api/fathom/sync");
      if (res.ok) {
        setSyncStatus(await res.json());
      }
    } catch {}
  }

  async function syncFromFathom() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/fathom/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(
          `Imported ${data.imported} new call${data.imported !== 1 ? "s" : ""} (${data.total} total)`
        );
        await loadRecordings();
        await loadSyncStatus();
      } else {
        setSyncResult(data.error || "Sync failed");
      }
    } catch {
      setSyncResult("Failed to sync from Fathom");
    } finally {
      setSyncing(false);
    }
  }

  async function assignProject(
    recordingId: string,
    projectId: string,
    projectName: string
  ) {
    try {
      await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName }),
      });
      setRecordings((prev) =>
        prev.map((r) =>
          r.id === recordingId
            ? { ...r, projectId, projectName, suggestedProjectId: undefined, suggestedProjectName: undefined }
            : r
        )
      );
    } catch {
      alert("Failed to assign project");
    }
  }

  async function unassignProject(recordingId: string) {
    try {
      await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: null, projectName: null }),
      });
      setRecordings((prev) =>
        prev.map((r) =>
          r.id === recordingId ? { ...r, projectId: undefined, projectName: undefined } : r
        )
      );
    } catch {
      alert("Failed to unassign project");
    }
  }

  async function createAndAssignProject(recordingId: string, projectName: string) {
    try {
      // Create the project
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        alert(createData.error || "Failed to create project");
        return;
      }

      const newProject = createData.project;

      // Assign the recording to the new project
      await assignProject(recordingId, newProject.id, newProject.name);

      // Refresh projects list
      await loadProjects();
    } catch {
      alert("Failed to create project");
    }
  }

  async function deleteRecording(id: string) {
    try {
      await fetch(`/api/recordings/${id}`, { method: "DELETE" });
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      alert("Failed to delete recording");
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
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.summary?.toLowerCase().includes(search.toLowerCase()) ||
      r.projectName?.toLowerCase().includes(search.toLowerCase()) ||
      r.participants?.some((p) =>
        p.toLowerCase().includes(search.toLowerCase())
      )
  );

  const inbox = filtered.filter((r) => !r.projectId);
  const assigned = filtered.filter((r) => r.projectId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Film className="h-6 w-6 text-orange-600" />
            Call Recordings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {recordings.length} recording{recordings.length !== 1 ? "s" : ""} &mdash;{" "}
            {inbox.length} in inbox, {assigned.length} assigned
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={syncFromFathom}
            disabled={syncing}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {syncing ? "Syncing..." : "Sync from Fathom"}
          </Button>
          <Button variant="outline" size="sm" onClick={loadRecordings}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Sync status / setup */}
      {syncStatus && !syncStatus.apiKeyConfigured && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-500 mb-1">
              Fathom API Key Required
            </p>
            <p className="text-xs text-muted-foreground">
              Add <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">FATHOM_API_KEY</code> to
              your environment variables. Get your API key from{" "}
              <span className="font-medium">Fathom Settings &rarr; Integrations &rarr; API</span>.
            </p>
          </CardContent>
        </Card>
      )}

      {syncStatus?.lastSyncAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {new Date(syncStatus.lastSyncAt).toLocaleString()}
        </p>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/50 text-sm">
          <span>{syncResult}</span>
          <button
            onClick={() => setSyncResult(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>
      )}

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
              Click &ldquo;Sync from Fathom&rdquo; to import your call recordings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="inbox">
          <TabsList>
            <TabsTrigger value="inbox">
              Inbox ({inbox.length})
            </TabsTrigger>
            <TabsTrigger value="assigned">
              Assigned ({assigned.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4">
            {inbox.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Check className="h-6 w-6 mx-auto mb-2 text-green-500" />
                  <p className="text-sm text-muted-foreground">
                    All caught up! No unassigned recordings.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {inbox.map((rec) => (
                  <RecordingCard
                    key={rec.id}
                    recording={rec}
                    projects={projects}
                    expanded={expanded.has(rec.id)}
                    onToggleExpand={() => toggleExpand(rec.id)}
                    onAssignProject={assignProject}
                    onCreateProject={createAndAssignProject}
                    onDelete={deleteRecording}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assigned" className="mt-4">
            {assigned.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <FolderOpen className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No recordings assigned to projects yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {assigned.map((rec) => (
                  <RecordingCard
                    key={rec.id}
                    recording={rec}
                    projects={projects}
                    expanded={expanded.has(rec.id)}
                    onToggleExpand={() => toggleExpand(rec.id)}
                    onAssignProject={assignProject}
                    onCreateProject={createAndAssignProject}
                    onUnassign={unassignProject}
                    onDelete={deleteRecording}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
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
  onCreateProject,
  onUnassign,
  onDelete,
}: {
  recording: FathomRecording;
  projects: any[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAssignProject: (id: string, projectId: string, projectName: string) => void;
  onCreateProject: (recordingId: string, projectName: string) => void;
  onUnassign?: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const hasSuggestion =
    recording.suggestedProjectId && !recording.projectId;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
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
              {hasSuggestion && (
                <Badge
                  variant="secondary"
                  className="text-xs shrink-0 bg-amber-500/10 text-amber-600 cursor-pointer hover:bg-amber-500/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignProject(
                      recording.id,
                      recording.suggestedProjectId!,
                      recording.suggestedProjectName!
                    );
                  }}
                >
                  <Sparkles className="h-2.5 w-2.5 mr-1" />
                  Suggested: {recording.suggestedProjectName}
                  {recording.matchConfidence === "high" ? " (high)" : " (med)"}
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
              {recording.duration ? (
                <>
                  <span>&middot;</span>
                  <span>{formatDuration(recording.duration)}</span>
                </>
              ) : null}
              {recording.participants && recording.participants.length > 0 && (
                <>
                  <span>&middot;</span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {recording.participants.slice(0, 3).join(", ")}
                    {recording.participants.length > 3 &&
                      ` +${recording.participants.length - 3}`}
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
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onToggleExpand}
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Summary preview */}
        {recording.summary && !expanded && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
            {cleanSummary(recording.summary).replace(/#{1,3}\s/g, "").slice(0, 200)}
          </p>
        )}

        {/* Expanded Content */}
        {expanded && (
          <div className="mt-3 space-y-3">
            {recording.summary && (
              <div className="bg-muted/40 rounded p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Summary
                </p>
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_li]:my-0.5 [&_p]:my-1">
                  <ReactMarkdown>{cleanSummary(recording.summary)}</ReactMarkdown>
                </div>
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
                      <span className="text-green-500 mt-0.5">&bull;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recording.attendeeEmails &&
              recording.attendeeEmails.length > 0 && (
                <div>
                  <p className="text-xs font-medium flex items-center gap-1 mb-1.5">
                    <Mail className="h-3 w-3" /> Attendee Emails
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recording.attendeeEmails.map((email, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-xs font-normal"
                      >
                        {email}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                className="flex-1 min-w-[140px] h-7 text-xs rounded border border-border bg-background px-2 text-muted-foreground"
                value={recording.projectId || recording.suggestedProjectId || ""}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setShowNewProject(true);
                    e.target.value = "";
                  } else {
                    const proj = projects.find((p: any) => p.id === e.target.value);
                    if (proj) onAssignProject(recording.id, proj.id, proj.name);
                    else onAssignProject(recording.id, "", "");
                  }
                }}
              >
                <option value="">Assign to project...</option>
                <option value="__new__">+ Create new project</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {recording.projectId && onUnassign && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onUnassign(recording.id)}
                >
                  Unassign
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(recording.id)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>

            {/* Inline new project creation */}
            {showNewProject && (
              <div className="flex items-center gap-2 pt-2">
                <Plus className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                <Input
                  autoFocus
                  placeholder="New project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="flex-1 h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newProjectName.trim()) {
                      setCreating(true);
                      onCreateProject(recording.id, newProjectName.trim());
                      setShowNewProject(false);
                      setNewProjectName("");
                      setCreating(false);
                    } else if (e.key === "Escape") {
                      setShowNewProject(false);
                      setNewProjectName("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                  disabled={!newProjectName.trim() || creating}
                  onClick={() => {
                    if (newProjectName.trim()) {
                      setCreating(true);
                      onCreateProject(recording.id, newProjectName.trim());
                      setShowNewProject(false);
                      setNewProjectName("");
                      setCreating(false);
                    }
                  }}
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowNewProject(false);
                    setNewProjectName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
