"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  Camera,
  ExternalLink,
  Globe,
  Loader2,
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

interface ScreenshotItem {
  id: string;
  url: string;
  title: string;
  createdAt: number;
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [activeTab, setActiveTab] = useState<"projects" | "screenshots">(
    "projects"
  );

  useEffect(() => {
    loadProjects();
    loadScreenshots();
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

  async function loadScreenshots() {
    try {
      const res = await fetch("/api/screenshot?profile=erik");
      const data = await res.json();
      setScreenshots(data.screenshots || []);
    } catch {
      // Redis not configured
    }
  }

  async function captureScreenshot(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshotUrl.trim() || capturing) return;

    setCapturing(true);
    try {
      const res = await fetch("/api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: screenshotUrl, profile: "erik" }),
      });
      const data = await res.json();
      if (data.success) {
        setScreenshots((prev) => [data.screenshot, ...prev]);
        setScreenshotUrl("");
      }
    } catch (error) {
      console.error("Screenshot capture failed:", error);
    } finally {
      setCapturing(false);
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

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("projects")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "projects"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Projects
        </button>
        <button
          onClick={() => setActiveTab("screenshots")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "screenshots"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Screenshots
        </button>
      </div>

      {activeTab === "projects" ? (
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
                  className="group hover:shadow-md transition-shadow cursor-pointer"
                >
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
      ) : (
        /* Screenshots */
        <div className="space-y-6">
          {/* Capture Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Capture Screenshot</CardTitle>
              <CardDescription>
                Enter a URL to capture a screenshot using Puppeteer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={captureScreenshot} className="flex gap-2">
                <Input
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  placeholder="https://example.com"
                  disabled={capturing}
                  className="flex-1"
                  type="url"
                />
                <Button
                  type="submit"
                  disabled={!screenshotUrl.trim() || capturing}
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                >
                  {capturing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  Capture
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Screenshots Grid */}
          {screenshots.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Camera className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                No screenshots captured yet. Enter a URL above to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {screenshots.map((ss) => (
                <Card key={ss.id} className="overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <Globe className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate">{ss.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ss.url}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(ss.createdAt).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
