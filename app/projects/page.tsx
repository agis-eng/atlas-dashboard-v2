"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ExternalLink,
  Globe,
  FolderOpen,
  Search,
  Filter,
  CheckCircle2,
  Plus,
} from "lucide-react";

interface ProjectItem {
  id: string;
  name: string;
  clientId?: string;
  owner?: string;
  stage?: string;
  status?: string;
  summary?: string;
  lastUpdate?: string;
  previewUrl?: string;
  liveUrl?: string;
  repoUrl?: string;
  rank?: number;
  priority?: string;
  archived?: boolean;
}

const stageColors: Record<string, string> = {
  Client: "bg-green-500/10 text-green-500 border-green-500/20",
  Internal: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Lead: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  Contractor: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  Live: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  Design: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  QA: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  Partner: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  Active: "bg-green-500/10 text-green-500 border-green-500/20",
  Done: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

function isActiveProject(p: ProjectItem): boolean {
  const stage = (p.stage || "").toLowerCase();
  const status = (p.status || "").toLowerCase();
  if (p.archived) return false;
  if (stage === "done") return false;
  return (
    stage === "client" ||
    stage === "active" ||
    status.includes("active")
  );
}

function isCompletedProject(p: ProjectItem): boolean {
  if (p.archived) return true;
  const stage = (p.stage || "").toLowerCase();
  return stage === "done";
}

function SitePreview({ url, projectId }: { url: string; projectId: string }) {
  const [hasScreenshot, setHasScreenshot] = useState(true);
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  const screenshotUrl = `/screenshots/${projectId}.png`;

  return (
    <div className="relative aspect-video bg-muted/20 overflow-hidden">
      {hasScreenshot ? (
        <img
          src={screenshotUrl}
          alt={`Screenshot of ${hostname}`}
          className="w-full h-full object-cover object-top"
          onError={() => setHasScreenshot(false)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
          <img
            src={faviconUrl}
            alt=""
            className="h-8 w-8 opacity-50"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <span className="text-xs text-muted-foreground text-center truncate w-full">
            {hostname}
          </span>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, onPriorityChange }: { project: ProjectItem; onPriorityChange: (id: string, priority: string) => void }) {
  const [priorityOpen, setPriorityOpen] = useState(false);
  const priorityColors: Record<string, string> = {
    high: "text-red-500 bg-red-500/10",
    medium: "text-yellow-500 bg-yellow-500/10",
    low: "text-muted-foreground bg-muted",
  };

  return (
    <div className="relative">
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="group hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
        {(project.liveUrl || project.previewUrl) && (
          <SitePreview url={(project.liveUrl || project.previewUrl)!} projectId={project.id} />
        )}
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-orange-600/10 flex items-center justify-center shrink-0">
                <FolderOpen className="h-4 w-4 text-orange-600" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base truncate">
                  {project.name}
                </CardTitle>
                <div className="flex items-center gap-1.5 mt-1">
                  {project.stage && (
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full border ${
                        stageColors[project.stage] ||
                        "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {project.stage}
                    </span>
                  )}
                  {project.owner && (
                    <span className="text-xs text-muted-foreground">
                      {project.owner}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {(project.liveUrl || project.previewUrl) && (
              <a
                href={project.liveUrl || project.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          <CardDescription className="mt-2 line-clamp-2">
            {project.summary || project.status || "No description"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Globe className="h-3 w-3" />
              <span>
                {project.lastUpdate
                  ? `Updated ${project.lastUpdate}`
                  : "No update date"}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPriorityOpen((v) => !v); }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${priorityColors[project.priority || 'low'] || priorityColors.low}`}
            >
              {project.priority || "low"} ▾
            </button>
          </div>
        </CardContent>
      </Card>
    </Link>
    {priorityOpen && (
      <div
        className="absolute bottom-10 right-3 z-50 w-28 rounded-md border border-border bg-popover shadow-lg text-sm text-popover-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {["high", "medium", "low"].map((pr) => (
          <button
            key={pr}
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-muted capitalize"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPriorityChange(project.id, pr); setPriorityOpen(false); }}
          >
            {pr}
          </button>
        ))}
      </div>
    )}
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    clientId: "",
    owner: "Erik",
    stage: "Lead",
    status: "New project",
    summary: "",
    priority: "medium",
  });

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      console.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  async function updateProjectPriority(id: string, priority: string) {
    const previous = projects;
    setProjects((current) =>
      current
        .map((project) => (project.id === id ? { ...project, priority } : project))
        .sort((a, b) => {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return (order[a.priority || 'low'] ?? 3) - (order[b.priority || 'low'] ?? 3);
        })
    );

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) throw new Error('Priority update failed');
      await loadProjects();
    } catch (error) {
      console.error(error);
      setProjects(previous);
    }
  }

  async function createProject() {
    if (!newProject.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project');
      setShowCreate(false);
      setNewProject({
        name: '', clientId: '', owner: 'Erik', stage: 'Lead', status: 'New project', summary: '', priority: 'medium'
      });
      await loadProjects();
    } catch (error) {
      console.error(error);
    } finally {
      setCreating(false);
    }
  }

  const stages = [
    "all",
    ...Array.from(new Set(projects.map((p) => p.stage).filter(Boolean))).sort(),
  ];
  const owners = [
    "all",
    ...Array.from(new Set(projects.map((p) => p.owner).filter(Boolean))).sort(),
  ];

  const filtered = projects.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.summary?.toLowerCase().includes(search.toLowerCase()) ||
      p.clientId?.toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === "all" || p.stage === stageFilter;
    const matchesOwner = ownerFilter === "all" || p.owner === ownerFilter;
    return matchesSearch && matchesStage && matchesOwner;
  });

  const activeProjects = filtered.filter(isActiveProject);
  const completedProjects = filtered.filter(isCompletedProject);
  const otherProjects = filtered.filter(
    (p) => !isActiveProject(p) && !isCompletedProject(p)
  );

  function renderProjectGrid(items: ProjectItem[]) {
    if (items.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No projects in this section.</p>
        </div>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((project) => (
          <ProjectCard key={project.id} project={project} onPriorityChange={updateProjectPriority} />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            {loading
              ? "Loading projects..."
              : `${filtered.length} of ${projects.length} projects`}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold">Create Project</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Project name" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} className="sm:col-span-2" />
              <Input placeholder="Client ID" value={newProject.clientId} onChange={(e) => setNewProject({ ...newProject, clientId: e.target.value })} />
              <select value={newProject.owner} onChange={(e) => setNewProject({ ...newProject, owner: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="Erik">Erik</option>
                <option value="Anton">Anton</option>
              </select>
              <select value={newProject.stage} onChange={(e) => setNewProject({ ...newProject, stage: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="Lead">Lead</option>
                <option value="Client">Client</option>
                <option value="Internal">Internal</option>
                <option value="Contractor">Contractor</option>
                <option value="Live">Live</option>
              </select>
              <select value={newProject.priority} onChange={(e) => setNewProject({ ...newProject, priority: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <Input placeholder="Status" value={newProject.status} onChange={(e) => setNewProject({ ...newProject, status: e.target.value })} className="sm:col-span-2" />
              <textarea placeholder="Summary" value={newProject.summary} onChange={(e) => setNewProject({ ...newProject, summary: e.target.value })} className="sm:col-span-2 min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createProject} disabled={creating || !newProject.name.trim()}>{creating ? 'Creating...' : 'Create Project'}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {/* Search & Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="bg-background border border-input rounded-md px-3 py-2 text-sm"
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All Stages" : s}
                </option>
              ))}
            </select>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="bg-background border border-input rounded-md px-3 py-2 text-sm"
            >
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o === "all" ? "All Owners" : o}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Projects Content */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-muted rounded animate-pulse w-1/4" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-3 bg-muted rounded animate-pulse w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No projects match your filters.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Active Projects Section */}
            {activeProjects.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <h2 className="text-lg font-semibold">Active Projects</h2>
                  <span className="text-sm text-muted-foreground">({activeProjects.length})</span>
                </div>
                {renderProjectGrid(activeProjects)}
              </section>
            )}

            {/* Other Projects Section */}
            {otherProjects.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <h2 className="text-lg font-semibold">Other Projects</h2>
                  <span className="text-sm text-muted-foreground">({otherProjects.length})</span>
                </div>
                {renderProjectGrid(otherProjects)}
              </section>
            )}

            {/* Completed Projects Section */}
            {completedProjects.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-4 w-4 text-zinc-400" />
                  <h2 className="text-lg font-semibold text-muted-foreground">Completed Projects</h2>
                  <span className="text-sm text-muted-foreground">({completedProjects.length})</span>
                </div>
                {renderProjectGrid(completedProjects)}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
