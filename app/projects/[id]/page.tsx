"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  FolderOpen,
  GitBranch,
  Eye,
  DollarSign,
  Brain,
  User,
  Calendar,
  Tag,
  AlertTriangle,
} from "lucide-react";

interface ProjectDetail {
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
  tags?: string[];
  affiliate?: {
    active?: boolean;
    program_name?: string;
    commission?: string;
    commission_type?: string;
    commission_pct?: number;
    avg_deal_size?: number;
    monthly_leads?: number;
    monthly_potential?: number;
    status?: string;
    notes?: string;
    affiliate_url?: string;
    signup_url?: string;
  };
  brain?: Record<string, unknown>;
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

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Project not found");
          } else {
            setError("Failed to load project");
          }
          return;
        }
        const data = await res.json();
        setProject(data.project);
      } catch {
        setError("Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>
        <div className="text-center py-12">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">{error || "Project not found"}</p>
        </div>
      </div>
    );
  }

  const hasAffiliate =
    project.affiliate && Object.keys(project.affiliate).length > 0;
  const hasBrain = project.brain && Object.keys(project.brain).length > 0;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Projects
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-orange-600/10 flex items-center justify-center">
            <FolderOpen className="h-7 w-7 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {project.stage && (
                <span
                  className={`inline-block text-xs px-2.5 py-0.5 rounded-full border ${
                    stageColors[project.stage] ||
                    "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {project.stage}
                </span>
              )}
              {project.priority && (
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium uppercase ${
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
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.summary && (
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm">{project.summary}</p>
              </div>
            )}
            {project.status && project.status !== project.summary && (
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-sm">{project.status}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {project.owner && (
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Owner</p>
                    <p className="text-sm">{project.owner}</p>
                  </div>
                </div>
              )}
              {project.clientId && (
                <div className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="text-sm">{project.clientId}</p>
                  </div>
                </div>
              )}
              {project.lastUpdate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last Update</p>
                    <p className="text-sm">{project.lastUpdate}</p>
                  </div>
                </div>
              )}
            </div>
            {project.tags && project.tags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <Globe className="h-4 w-4 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Live Site</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {project.liveUrl}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            {project.previewUrl &&
              project.previewUrl !== project.liveUrl && (
                <a
                  href={project.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <Eye className="h-4 w-4 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Preview</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {project.previewUrl}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              )}
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <GitBranch className="h-4 w-4 text-purple-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Repository</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {project.repoUrl}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            {!project.liveUrl && !project.previewUrl && !project.repoUrl && (
              <p className="text-sm text-muted-foreground py-2">
                No links available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Affiliate section */}
      {hasAffiliate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              Affiliate / Revenue
            </CardTitle>
            {project.affiliate!.program_name && (
              <CardDescription>
                {project.affiliate!.program_name}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {project.affiliate!.commission && (
                <div>
                  <p className="text-xs text-muted-foreground">Commission</p>
                  <p className="text-sm font-medium">
                    {project.affiliate!.commission}
                  </p>
                </div>
              )}
              {project.affiliate!.avg_deal_size != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Avg Deal Size</p>
                  <p className="text-sm font-medium">
                    ${project.affiliate!.avg_deal_size.toLocaleString()}
                  </p>
                </div>
              )}
              {project.affiliate!.monthly_leads != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Leads</p>
                  <p className="text-sm font-medium">
                    {project.affiliate!.monthly_leads}
                  </p>
                </div>
              )}
              {project.affiliate!.monthly_potential != null && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    Monthly Potential
                  </p>
                  <p className="text-sm font-medium">
                    ${project.affiliate!.monthly_potential.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
            {project.affiliate!.notes && (
              <p className="text-sm text-muted-foreground mt-3">
                {project.affiliate!.notes}
              </p>
            )}
            {project.affiliate!.status && (
              <div className="mt-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    project.affiliate!.status === "active"
                      ? "bg-green-500/10 text-green-500 border-green-500/20"
                      : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                  }`}
                >
                  {project.affiliate!.status}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Brain section */}
      {hasBrain && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-500" />
              Project Brain
            </CardTitle>
            <CardDescription>
              Knowledge base and documents for this project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(project.brain, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
