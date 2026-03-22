"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  LinkIcon,
  StickyNote,
  Loader2,
} from "lucide-react";

// ── Types ──

interface BrainLink {
  url: string;
  label: string;
}

interface ProjectBrain {
  links?: BrainLink[];
  notes?: string[];
}

interface Affiliate {
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
}

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
  affiliate?: Affiliate;
  brain?: ProjectBrain;
}

// ── Constants ──

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

const STAGES = [
  "Client",
  "Internal",
  "Lead",
  "Contractor",
  "Live",
  "Design",
  "QA",
  "Partner",
  "Active",
];
const PRIORITIES = ["high", "medium", "low"];
const OWNERS = ["Erik", "Anton"];

// ── Toast ──

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
        type === "success"
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      {message}
    </div>
  );
}

// ── Inline editable field ──

function EditableField({
  label,
  value,
  editing,
  onChange,
  type = "text",
  options,
  icon,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (val: string) => void;
  type?: "text" | "select" | "textarea";
  options?: string[];
  icon?: React.ReactNode;
}) {
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm">{value || "—"}</p>
        </div>
      </div>
    );
  }

  if (type === "select" && options) {
    return (
      <div className="flex items-center gap-2">
        {icon}
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">None</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex-1">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
        />
      </div>
    </div>
  );
}

// ── Tags editor ──

function TagsEditor({
  tags,
  editing,
  onChange,
}: {
  tags: string[];
  editing: boolean;
  onChange: (tags: string[]) => void;
}) {
  const [newTag, setNewTag] = useState("");

  if (!editing) {
    if (!tags.length) return null;
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground inline-flex items-center gap-1"
          >
            {tag}
            <button
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add tag..."
          className="h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTag.trim()) {
              e.preventDefault();
              if (!tags.includes(newTag.trim())) {
                onChange([...tags, newTag.trim()]);
              }
              setNewTag("");
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={() => {
            if (newTag.trim() && !tags.includes(newTag.trim())) {
              onChange([...tags, newTag.trim()]);
            }
            setNewTag("");
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Brain Section ──

function BrainSection({
  brain,
  editing,
  onChange,
}: {
  brain: ProjectBrain;
  editing: boolean;
  onChange: (brain: ProjectBrain) => void;
}) {
  const links = brain.links || [];
  const notes = brain.notes || [];

  const addLink = () => {
    onChange({ ...brain, links: [...links, { url: "", label: "" }] });
  };
  const updateLink = (idx: number, field: "url" | "label", val: string) => {
    const updated = links.map((l, i) =>
      i === idx ? { ...l, [field]: val } : l
    );
    onChange({ ...brain, links: updated });
  };
  const removeLink = (idx: number) => {
    onChange({ ...brain, links: links.filter((_, i) => i !== idx) });
  };
  const addNote = () => {
    onChange({ ...brain, notes: [...notes, ""] });
  };
  const updateNote = (idx: number, val: string) => {
    const updated = notes.map((n, i) => (i === idx ? val : n));
    onChange({ ...brain, notes: updated });
  };
  const removeNote = (idx: number) => {
    onChange({ ...brain, notes: notes.filter((_, i) => i !== idx) });
  };

  const totalItems = links.length + notes.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-500" />
          Project Brain
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500">
              {totalItems}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Links, notes, and knowledge for this project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Links */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Links
            </p>
          </div>
          {links.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">No links yet</p>
          )}
          <div className="space-y-2">
            {links.map((link, idx) =>
              editing ? (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={link.label}
                      onChange={(e) => updateLink(idx, "label", e.target.value)}
                      placeholder="Label"
                      className="h-7 text-xs"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) => updateLink(idx, "url", e.target.value)}
                      placeholder="https://..."
                      className="h-7 text-xs"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLink(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group text-sm"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{link.label || link.url}</span>
                </a>
              )
            )}
          </div>
          {editing && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={addLink}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Link
            </Button>
          )}
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Notes
            </p>
          </div>
          {notes.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">No notes yet</p>
          )}
          <div className="space-y-2">
            {notes.map((note, idx) =>
              editing ? (
                <div key={idx} className="flex gap-2 items-start">
                  <textarea
                    value={note}
                    onChange={(e) => updateNote(idx, e.target.value)}
                    placeholder="Add a note..."
                    rows={2}
                    className="flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeNote(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  key={idx}
                  className="text-sm p-2.5 rounded-lg bg-muted/50 whitespace-pre-wrap"
                >
                  {note}
                </div>
              )
            )}
          </div>
          {editing && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={addNote}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Note
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Affiliate Section ──

function AffiliateSection({
  affiliate,
  editing,
  onChange,
}: {
  affiliate: Affiliate;
  editing: boolean;
  onChange: (aff: Affiliate) => void;
}) {
  const update = (field: keyof Affiliate, val: string | number) => {
    onChange({ ...affiliate, [field]: val });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500" />
          Affiliate / Revenue
        </CardTitle>
        {affiliate.program_name && (
          <CardDescription>
            {editing ? (
              <Input
                value={affiliate.program_name}
                onChange={(e) => update("program_name", e.target.value)}
                className="h-7 text-xs mt-1"
                placeholder="Program name"
              />
            ) : (
              affiliate.program_name
            )}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {editing ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Commission</p>
                <Input
                  value={affiliate.commission || ""}
                  onChange={(e) => update("commission", e.target.value)}
                  className="h-7 text-xs"
                  placeholder="e.g., 20% recurring"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Avg Deal Size
                </p>
                <Input
                  type="number"
                  value={affiliate.avg_deal_size ?? ""}
                  onChange={(e) =>
                    update(
                      "avg_deal_size",
                      e.target.value ? Number(e.target.value) : 0
                    )
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Monthly Leads
                </p>
                <Input
                  type="number"
                  value={affiliate.monthly_leads ?? ""}
                  onChange={(e) =>
                    update(
                      "monthly_leads",
                      e.target.value ? Number(e.target.value) : 0
                    )
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Monthly Potential
                </p>
                <Input
                  type="number"
                  value={affiliate.monthly_potential ?? ""}
                  onChange={(e) =>
                    update(
                      "monthly_potential",
                      e.target.value ? Number(e.target.value) : 0
                    )
                  }
                  className="h-7 text-xs"
                />
              </div>
            </>
          ) : (
            <>
              {affiliate.commission && (
                <div>
                  <p className="text-xs text-muted-foreground">Commission</p>
                  <p className="text-sm font-medium">{affiliate.commission}</p>
                </div>
              )}
              {affiliate.avg_deal_size != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Avg Deal Size</p>
                  <p className="text-sm font-medium">
                    ${affiliate.avg_deal_size.toLocaleString()}
                  </p>
                </div>
              )}
              {affiliate.monthly_leads != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Leads</p>
                  <p className="text-sm font-medium">
                    {affiliate.monthly_leads}
                  </p>
                </div>
              )}
              {affiliate.monthly_potential != null && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    Monthly Potential
                  </p>
                  <p className="text-sm font-medium">
                    ${affiliate.monthly_potential.toLocaleString()}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        {editing ? (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <textarea
              value={affiliate.notes || ""}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
              placeholder="Affiliate notes..."
            />
          </div>
        ) : (
          affiliate.notes && (
            <p className="text-sm text-muted-foreground mt-3">
              {affiliate.notes}
            </p>
          )
        )}
        {affiliate.status && !editing && (
          <div className="mt-3">
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${
                affiliate.status === "active"
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
              }`}
            >
              {affiliate.status}
            </span>
          </div>
        )}
        {editing && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <select
              value={affiliate.status || ""}
              onChange={(e) => update("status", e.target.value)}
              className="h-7 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">None</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProjectDetail | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Project not found" : "Failed to load project");
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

  const startEditing = useCallback(() => {
    if (project) {
      setDraft(JSON.parse(JSON.stringify(project)));
      setEditing(true);
    }
  }, [project]);

  const cancelEditing = useCallback(() => {
    setDraft(null);
    setEditing(false);
  }, []);

  const saveChanges = useCallback(async () => {
    if (!draft) return;
    setSaving(true);

    // Optimistic update
    const previous = project;
    setProject(draft);

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          owner: draft.owner,
          clientId: draft.clientId,
          stage: draft.stage,
          status: draft.status,
          priority: draft.priority,
          tags: draft.tags,
          summary: draft.summary,
          affiliate: draft.affiliate,
          brain: draft.brain,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      const data = await res.json();
      setProject(data.project);
      setEditing(false);
      setDraft(null);
      setToast({ message: "Project saved", type: "success" });
    } catch (err: any) {
      // Rollback
      setProject(previous);
      setToast({ message: err.message || "Failed to save", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [draft, project, id]);

  const updateDraft = useCallback(
    (field: keyof ProjectDetail, value: any) => {
      if (draft) {
        setDraft({ ...draft, [field]: value });
      }
    },
    [draft]
  );

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

  const p = editing && draft ? draft : project;
  const hasAffiliate =
    p.affiliate && Object.keys(p.affiliate).length > 0;
  const hasBrain =
    p.brain &&
    ((p.brain.links && p.brain.links.length > 0) ||
      (p.brain.notes && p.brain.notes.length > 0));

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

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
            {editing ? (
              <Input
                value={draft?.name || ""}
                onChange={(e) => updateDraft("name", e.target.value)}
                className="text-2xl font-semibold h-auto py-0.5 px-1"
              />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">
                {p.name}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-1">
              {editing ? (
                <>
                  <select
                    value={draft?.stage || ""}
                    onChange={(e) => updateDraft("stage", e.target.value)}
                    className="text-xs px-2 py-0.5 rounded-full border border-input bg-transparent outline-none"
                  >
                    <option value="">Stage...</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft?.priority || ""}
                    onChange={(e) => updateDraft("priority", e.target.value)}
                    className="text-xs px-2 py-0.5 rounded-full border border-input bg-transparent outline-none uppercase"
                  >
                    <option value="">Priority...</option>
                    {PRIORITIES.map((pr) => (
                      <option key={pr} value={pr}>
                        {pr}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  {p.stage && (
                    <span
                      className={`inline-block text-xs px-2.5 py-0.5 rounded-full border ${
                        stageColors[p.stage] ||
                        "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {p.stage}
                    </span>
                  )}
                  {p.priority && (
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium uppercase ${
                        p.priority === "high"
                          ? "bg-red-500/10 text-red-500"
                          : p.priority === "medium"
                            ? "bg-yellow-500/10 text-yellow-500"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.priority}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Edit / Save / Cancel buttons */}
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEditing}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={saveChanges} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
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
            <EditableField
              label="Description"
              value={p.summary || ""}
              editing={editing}
              onChange={(v) => updateDraft("summary", v)}
              type="textarea"
            />
            {(p.status || editing) && (
              <EditableField
                label="Status"
                value={p.status || ""}
                editing={editing}
                onChange={(v) => updateDraft("status", v)}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <EditableField
                label="Owner"
                value={p.owner || ""}
                editing={editing}
                onChange={(v) => updateDraft("owner", v)}
                type="select"
                options={OWNERS}
                icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
              />
              <EditableField
                label="Client"
                value={p.clientId || ""}
                editing={editing}
                onChange={(v) => updateDraft("clientId", v)}
                icon={<Tag className="h-3.5 w-3.5 text-muted-foreground" />}
              />
              {!editing && p.lastUpdate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last Update</p>
                    <p className="text-sm">{p.lastUpdate}</p>
                  </div>
                </div>
              )}
            </div>
            <TagsEditor
              tags={p.tags || []}
              editing={editing}
              onChange={(tags) => updateDraft("tags", tags)}
            />
          </CardContent>
        </Card>

        {/* Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {p.liveUrl && (
              <a
                href={p.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <Globe className="h-4 w-4 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Live Site</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.liveUrl}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            {p.previewUrl && p.previewUrl !== p.liveUrl && (
              <a
                href={p.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <Eye className="h-4 w-4 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Preview</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.previewUrl}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            {p.repoUrl && (
              <a
                href={p.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <GitBranch className="h-4 w-4 text-purple-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Repository</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.repoUrl}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            {!p.liveUrl && !p.previewUrl && !p.repoUrl && (
              <p className="text-sm text-muted-foreground py-2">
                No links available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Affiliate section */}
      {(hasAffiliate || editing) && (
        <AffiliateSection
          affiliate={
            (editing && draft ? draft.affiliate : project.affiliate) || {}
          }
          editing={editing}
          onChange={(aff) => updateDraft("affiliate", aff)}
        />
      )}

      {/* Brain section - always show in edit mode, or when brain has content */}
      {(hasBrain || editing) && (
        <BrainSection
          brain={(editing && draft ? draft.brain : project.brain) || {}}
          editing={editing}
          onChange={(brain) => updateDraft("brain", brain)}
        />
      )}
    </div>
  );
}
