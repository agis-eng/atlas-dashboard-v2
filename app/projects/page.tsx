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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  FolderOpen,
} from "lucide-react";

interface ProjectItem {
  id: string;
  name: string;
  description: string;
  url?: string;
  screenshotUrl?: string;
  status: "active" | "paused" | "completed";
  createdAt: number;
  updatedAt: number;
}

interface ScreenshotItem {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

// Demo projects for when Redis isn't configured
const DEMO_PROJECTS: ProjectItem[] = [
  {
    id: "1",
    name: "Atlas Dashboard",
    description: "Personal command center and project management tool",
    url: "https://atlas.openclaw.dev",
    status: "active",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
  },
  {
    id: "2",
    name: "OpenClaw",
    description: "AI-powered contract analysis platform",
    url: "https://openclaw.dev",
    status: "active",
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: "3",
    name: "AutomateIQ",
    description: "eBay listing automation and analytics",
    url: "https://automateiq.dev",
    status: "paused",
    createdAt: Date.now() - 604800000,
    updatedAt: Date.now() - 86400000,
  },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>(DEMO_PROJECTS);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [activeTab, setActiveTab] = useState<"projects" | "screenshots">("projects");

  useEffect(() => {
    loadScreenshots();
  }, []);

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

  const statusColors = {
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    paused: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    completed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">
          Manage your projects and capture screenshots
        </p>
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
        /* Projects Grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="group hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-orange-600/10 flex items-center justify-center">
                      <FolderOpen className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{project.name}</CardTitle>
                      <span
                        className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full border ${statusColors[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </div>
                  </div>
                  {project.url && (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <CardDescription className="mt-2">{project.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  <span>
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
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
                    <p className="text-xs text-muted-foreground truncate">{ss.url}</p>
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
