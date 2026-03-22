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
import Link from "next/link";
import {
  ExternalLink,
  Globe,
  FolderOpen,
  Search,
  Filter,
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
};

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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

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

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            {loading
              ? "Loading projects..."
              : `${filtered.length} of ${projects.length} projects`}
          </p>
        </div>
      </div>

      <div className="space-y-6">
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

          {/* Projects Grid */}
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block"
                >
                <Card
                  className="group hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
                >
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
                      {project.priority && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                            project.priority === "high"
                              ? "bg-red-500/10 text-red-500"
                              : project.priority === "medium"
                                ? "bg-yellow-500/10 text-yellow-500"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {project.priority}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
