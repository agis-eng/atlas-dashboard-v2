"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Upload,
  FileText,
  Download,
  Camera,
  RefreshCw,
  Sparkles,
  Zap,
  Search,
} from "lucide-react";
import { ProjectChat } from "@/components/project-chat";

// ── Types ──

interface BrainLink {
  url: string;
  label: string;
}

interface BrainFile {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface ProjectBrain {
  links?: BrainLink[];
  notes?: string[];
  files?: BrainFile[];
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

interface CustomLink {
  label: string;
  url: string;
  icon?: string;
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
  vercelUrl?: string;
  githubBranch?: string;
  customLinks?: CustomLink[];
  rank?: number;
  priority?: string;
  tags?: string[];
  affiliate?: Affiliate;
  brain?: ProjectBrain;
}

interface ProjectDeckSlide {
  title: string;
  purpose?: string;
  bullets?: string[];
  visualIdea?: string;
  speakerNotes?: string;
  imagePrompt?: string;
}

interface ProjectDeck {
  id: string;
  title: string;
  subtitle?: string;
  deckType?: string;
  prompt?: string;
  audience?: string;
  objective?: string;
  narrativeArc?: string[];
  chosenSources?: string[];
  selectedSources?: Record<string, boolean>;
  visualStylePreset?: string;
  coverImagePrompt?: string;
  slides?: ProjectDeckSlide[];
}

interface SeoReport {
  id: string;
  title: string;
  url: string;
  createdAt?: string;
  seoScore: number;
  aisoScore: number;
  combinedScore: number;
  combinedGrade: string;
  summary?: string;
  quickWins?: string[];
  shareUrl?: string;
  findings?: { priority: string; issue: string }[];
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
            className="h-8 w-full rounded-lg border border-input bg-background text-foreground px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="" className="bg-background text-foreground">None</option>
            {options.map((o) => (
              <option key={o} value={o} className="bg-background text-foreground">
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
  projectId,
}: {
  brain: ProjectBrain;
  editing: boolean;
  onChange: (brain: ProjectBrain) => void;
  projectId: string;
}) {
  const links = brain.links || [];
  const notes = brain.notes || [];
  const files = brain.files || [];
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("projectId", projectId);
      for (let i = 0; i < selectedFiles.length; i++) {
        formData.append("files", selectedFiles[i]);
      }

      const res = await fetch("/api/projects/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        onChange({ ...brain, files: [...files, ...data.files] });
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteFile = async (filePath: string) => {
    try {
      const res = await fetch("/api/projects/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, filePath }),
      });
      const data = await res.json();
      if (data.success) {
        onChange({ ...brain, files: files.filter((f) => f.path !== filePath) });
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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

  const totalItems = links.length + notes.length + files.length;

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

        {/* Files */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Files
            </p>
          </div>
          {files.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">No files uploaded</p>
          )}
          <div className="space-y-1.5">
            {files.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm group"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} &middot; {file.uploadedAt}
                  </p>
                </div>
                <a
                  href={file.path}
                  download
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                {editing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteFile(file.path)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.csv,.zip"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                {uploading ? "Uploading..." : "Upload Files"}
              </Button>
            </div>
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
  const [clientContact, setClientContact] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  } | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProjectDetail | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [webpagePrompt, setWebpagePrompt] = useState("");
  const [webpagePreferredConcept, setWebpagePreferredConcept] = useState("");
  const [webpageCompetitorQuery, setWebpageCompetitorQuery] = useState("");
  const [webpageResearchCompetitors, setWebpageResearchCompetitors] = useState(true);
  const [generatingWebpage, setGeneratingWebpage] = useState(false);
  const [latestWebpageDraft, setLatestWebpageDraft] = useState<any>(null);
  const [seoUrl, setSeoUrl] = useState("");
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [seoReports, setSeoReports] = useState<SeoReport[]>([]);
  const [latestSeoReport, setLatestSeoReport] = useState<SeoReport | null>(null);
  const [deckPrompt, setDeckPrompt] = useState("");
  const [deckType, setDeckType] = useState("project-update");
  const [generatingDeck, setGeneratingDeck] = useState(false);
  const [latestDeck, setLatestDeck] = useState<ProjectDeck | null>(null);
  const [editingDeck, setEditingDeck] = useState(false);
  const [deckDraft, setDeckDraft] = useState<ProjectDeck | null>(null);
  const [savingDeck, setSavingDeck] = useState(false);
  const [generatingDeckVisuals, setGeneratingDeckVisuals] = useState(false);
  const [deckVisualStylePreset, setDeckVisualStylePreset] = useState('dark modern strategic');
  const [deckSources, setDeckSources] = useState<Record<string, boolean>>({
    projectMeta: true,
    clientInfo: true,
    brainNotes: true,
    brainLinks: true,
    webpageDraft: true,
    competitorInsights: true,
    affiliate: false,
  });
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
        
        // Load client contact info if clientId exists
        if (data.project?.clientId) {
          try {
            const clientRes = await fetch(`/api/clients/${encodeURIComponent(data.project.clientId)}`);
            if (clientRes.ok) {
              const clientData = await clientRes.json();
              setClientContact({
                name: clientData.name,
                email: clientData.contact || clientData.email,
                phone: clientData.phone,
              });
            }
          } catch (err) {
            console.error('Failed to load client contact:', err);
          }
        }

        try {
          const deckRes = await fetch(`/api/projects/${encodeURIComponent(id)}/deck`);
          if (deckRes.ok) {
            const deckData = await deckRes.json();
            setLatestDeck(deckData.deck || null);
            setDeckDraft(deckData.deck ? JSON.parse(JSON.stringify(deckData.deck)) : null);
            setDeckVisualStylePreset(deckData.deck?.visualStylePreset || 'dark modern strategic');
          }
        } catch (err) {
          console.error('Failed to load project deck:', err);
        }

        try {
          const seoRes = await fetch(`/api/seo-audit?projectId=${encodeURIComponent(id)}`);
          if (seoRes.ok) {
            const seoData = await seoRes.json();
            setSeoReports(seoData.reports || []);
            setLatestSeoReport((seoData.reports || [])[0] || null);
          }
        } catch (err) {
          console.error('Failed to load SEO reports:', err);
        }
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

  const deleteProject = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      router.push("/projects");
    } catch (e: any) {
      setToast({ message: e.message || "Failed to delete project", type: "error" });
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [id, router]);

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

  const generateWebpageDraft = useCallback(async () => {
    if (!webpagePrompt.trim()) return;
    setGeneratingWebpage(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/webpage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: webpagePrompt,
          preferredConcept: webpagePreferredConcept,
          competitorQuery: webpageCompetitorQuery,
          researchCompetitors: webpageResearchCompetitors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate webpage draft');
      setLatestWebpageDraft(data.page);
      setWebpagePrompt('');
      setWebpagePreferredConcept('');
      setWebpageCompetitorQuery('');
      setToast({ message: 'Website draft created', type: 'success' });
      const refreshed = await fetch(`/api/projects/${encodeURIComponent(id)}`);
      if (refreshed.ok) {
        const refreshedData = await refreshed.json();
        setProject(refreshedData.project);
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to generate webpage draft', type: 'error' });
    } finally {
      setGeneratingWebpage(false);
    }
  }, [id, webpagePrompt, webpagePreferredConcept, webpageCompetitorQuery, webpageResearchCompetitors]);

  const generateSeoAudit = useCallback(async () => {
    const targetUrl = seoUrl.trim() || project?.liveUrl || project?.previewUrl || '';
    if (!targetUrl) {
      setToast({ message: 'Add a live or preview URL first', type: 'error' });
      return;
    }
    setGeneratingSeo(true);
    try {
      const res = await fetch('/api/seo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, projectId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate SEO audit');
      setLatestSeoReport(data.report);
      setSeoReports((prev) => [data.report, ...prev.filter((x) => x.id !== data.report.id)]);
      setToast({ message: 'SEO audit created', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to generate SEO audit', type: 'error' });
    } finally {
      setGeneratingSeo(false);
    }
  }, [seoUrl, project?.liveUrl, project?.previewUrl, id]);

  const generateDeckDraft = useCallback(async () => {
    if (!deckPrompt.trim()) return;
    setGeneratingDeck(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/deck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: deckPrompt,
          deckType,
          selectedSources: deckSources,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate deck draft');
      setLatestDeck(data.deck);
      setDeckDraft(JSON.parse(JSON.stringify(data.deck)));
      setDeckVisualStylePreset(data.deck?.visualStylePreset || deckVisualStylePreset);
      setEditingDeck(false);
      setDeckPrompt('');
      setToast({ message: 'Deck draft created', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to generate deck draft', type: 'error' });
    } finally {
      setGeneratingDeck(false);
    }
  }, [id, deckPrompt, deckType, deckSources]);

  const reuseDeckSettings = useCallback(() => {
    if (!latestDeck) return;
    setDeckPrompt(latestDeck.prompt || "");
    setDeckType(latestDeck.deckType || "project-update");
    if (latestDeck.selectedSources) setDeckSources(latestDeck.selectedSources);
  }, [latestDeck]);

  const updateDeckSlide = useCallback((index: number, field: keyof ProjectDeckSlide, value: string) => {
    setDeckDraft((prev) => {
      if (!prev?.slides) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ProjectDeck;
      if (field === 'bullets') next.slides![index].bullets = value.split('\n').map((x) => x.trim()).filter(Boolean);
      else (next.slides![index] as any)[field] = value;
      return next;
    });
  }, []);

  const moveDeckSlide = useCallback((index: number, dir: -1 | 1) => {
    setDeckDraft((prev) => {
      if (!prev?.slides) return prev;
      const target = index + dir;
      if (target < 0 || target >= prev.slides.length) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ProjectDeck;
      const [item] = next.slides!.splice(index, 1);
      next.slides!.splice(target, 0, item);
      return next;
    });
  }, []);

  const removeDeckSlide = useCallback((index: number) => {
    setDeckDraft((prev) => {
      if (!prev?.slides) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ProjectDeck;
      next.slides = next.slides!.filter((_, i) => i !== index);
      return next;
    });
  }, []);

  const generateDeckVisualPrompts = useCallback(async () => {
    if (!latestDeck?.id) return;
    setGeneratingDeckVisuals(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/deck/visuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: latestDeck.id, stylePreset: deckVisualStylePreset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate deck visual prompts');
      setLatestDeck(data.deck);
      setDeckDraft(JSON.parse(JSON.stringify(data.deck)));
      setToast({ message: 'Deck visual prompts created', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to generate deck visual prompts', type: 'error' });
    } finally {
      setGeneratingDeckVisuals(false);
    }
  }, [id, latestDeck, deckVisualStylePreset]);

  const saveDeckDraft = useCallback(async () => {
    if (!deckDraft?.id) return;
    setSavingDeck(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/deck`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: deckDraft.id,
          updates: {
            title: deckDraft.title,
            subtitle: deckDraft.subtitle,
            audience: deckDraft.audience,
            objective: deckDraft.objective,
            narrativeArc: deckDraft.narrativeArc,
            slides: deckDraft.slides,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save deck draft');
      setLatestDeck(data.deck);
      setDeckDraft(JSON.parse(JSON.stringify(data.deck)));
      setEditingDeck(false);
      setToast({ message: 'Deck draft saved', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to save deck draft', type: 'error' });
    } finally {
      setSavingDeck(false);
    }
  }, [id, deckDraft]);

  if (loading) {
    return (
      <div className="p-6 md:p-8 xl:p-10 max-w-[1600px] mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6 md:p-8 xl:p-10 max-w-[1600px] mx-auto">
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
  const activeDeck = (editingDeck ? deckDraft : latestDeck) || null;
  const hasAffiliate =
    p.affiliate && Object.keys(p.affiliate).length > 0;
  const hasBrain =
    p.brain &&
    ((p.brain.links && p.brain.links.length > 0) ||
      (p.brain.notes && p.brain.notes.length > 0));

  return (
    <div className="p-6 md:p-8 xl:p-10 max-w-[1600px] mx-auto space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-lg p-6 max-w-sm mx-4 space-y-4">
            <h3 className="font-semibold text-lg">Delete Project</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{project.name}</strong>? This will archive the project and remove it from the projects list.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteProject}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
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
                    className="text-xs px-2 py-0.5 rounded-full border border-input bg-background text-foreground outline-none"
                  >
                    <option value="" className="bg-background text-foreground">Stage...</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s} className="bg-background text-foreground">
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft?.priority || ""}
                    onChange={(e) => updateDraft("priority", e.target.value)}
                    className="text-xs px-2 py-0.5 rounded-full border border-input bg-background text-foreground outline-none uppercase"
                  >
                    <option value="" className="bg-background text-foreground">Priority...</option>
                    {PRIORITIES.map((pr) => (
                      <option key={pr} value={pr} className="bg-background text-foreground uppercase">
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
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving || deleting}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
              <div className="flex-1" />
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
            <>
              <Button variant="outline" size="sm" onClick={generateWebpageDraft} disabled={generatingWebpage || !webpagePrompt.trim()}>
                {generatingWebpage ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                {generatingWebpage ? 'Generating…' : 'Create Webpage'}
              </Button>
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
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
            </div>
            {/* Client Contact Info */}
            {!editing && clientContact && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Client Contact</p>
                  {clientContact.name && (
                    <Link href={`/clients/${encodeURIComponent(p.clientId || '')}`} className="text-sm font-medium mb-1 inline-block hover:underline">
                      {clientContact.name}
                    </Link>
                  )}
                  {clientContact.email && (
                    <a
                      href={`mailto:${clientContact.email}`}
                      className="text-sm text-blue-600 hover:underline block truncate"
                    >
                      {clientContact.email}
                    </a>
                  )}
                  {clientContact.phone && (
                    <a
                      href={`tel:${clientContact.phone}`}
                      className="text-sm text-muted-foreground hover:underline block"
                    >
                      {clientContact.phone}
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
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
                  <p className="text-sm font-medium">GitHub Repository</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.repoUrl}
                    {p.githubBranch && <span className="ml-2 text-purple-400">({p.githubBranch})</span>}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            {p.vercelUrl && (
              <a
                href={p.vercelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <FolderOpen className="h-4 w-4 text-black dark:text-white" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Vercel Dashboard</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.vercelUrl}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            <div className="flex gap-2 mt-2">
              {(p.liveUrl || p.previewUrl) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={capturingScreenshot}
                  onClick={async () => {
                    setCapturingScreenshot(true);
                    try {
                      const url = p.liveUrl || p.previewUrl;
                      const res = await fetch(
                        `/api/projects/${encodeURIComponent(id)}/screenshot`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ url }),
                        }
                      );
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || "Failed to capture screenshot");
                      }
                      setToast({ message: "Screenshot captured!", type: "success" });
                      router.refresh();
                    } catch (err: any) {
                      setToast({
                        message: err.message || "Failed to capture screenshot",
                        type: "error",
                      });
                    } finally {
                      setCapturingScreenshot(false);
                    }
                  }}
                >
                  {capturingScreenshot ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  Capture
                </Button>
              )}
              <input
                ref={screenshotInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    setToast({ message: "File too large. Max 5MB.", type: "error" });
                    return;
                  }
                  setUploadingScreenshot(true);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await fetch(
                      `/api/projects/${encodeURIComponent(id)}/screenshot/upload`,
                      { method: "POST", body: formData }
                    );
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || "Failed to upload screenshot");
                    }
                    setToast({ message: "Screenshot uploaded!", type: "success" });
                    router.refresh();
                  } catch (err: any) {
                    setToast({
                      message: err.message || "Failed to upload screenshot",
                      type: "error",
                    });
                  } finally {
                    setUploadingScreenshot(false);
                    if (screenshotInputRef.current) {
                      screenshotInputRef.current.value = "";
                    }
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className={p.liveUrl || p.previewUrl ? "" : "flex-1"}
                disabled={uploadingScreenshot}
                onClick={() => screenshotInputRef.current?.click()}
              >
                {uploadingScreenshot ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload
              </Button>
            </div>
            {!p.liveUrl && !p.previewUrl && !p.repoUrl && (
              <p className="text-sm text-muted-foreground py-2">
                No links available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live Preview + AI Code Changes */}
      {(p.liveUrl || p.previewUrl) && (
        <LivePreviewWithAI 
          url={p.liveUrl || p.previewUrl || ''} 
          projectName={p.name}
          projectId={id}
          project={p}
        />
      )}

      {/* Website draft first, then SEO + deck tools on wider desktop layouts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Webpage Draft</CardTitle>
          <CardDescription>
            Generate a richer webpage concept using project/client context plus Atlas design-pattern references, then save it to project pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={webpagePrompt}
            onChange={(e) => setWebpagePrompt(e.target.value)}
            placeholder="Example: Create a polished behavioral health clinic homepage focused on trust, insurance-friendly messaging, and a clear intake CTA."
            className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Input
            value={webpagePreferredConcept}
            onChange={(e) => setWebpagePreferredConcept(e.target.value)}
            placeholder="Optional preferred concept name, e.g. 'editorial authority' or the exact recommended concept"
          />
          <Input
            value={webpageCompetitorQuery}
            onChange={(e) => setWebpageCompetitorQuery(e.target.value)}
            placeholder="Optional competitor search query, e.g. 'Atlanta behavioral health clinic intensive outpatient'"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={webpageResearchCompetitors}
              onChange={(e) => setWebpageResearchCompetitors(e.target.checked)}
            />
            Research competitors for inspiration (structure + messaging ideas only, never copy)
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              This creates a saved website draft record tied to the project with concepts, copy guidance, and optional competitor inspiration.
            </p>
            <Button onClick={generateWebpageDraft} disabled={generatingWebpage || !webpagePrompt.trim()}>
              {generatingWebpage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {generatingWebpage ? 'Generating Draft…' : 'Generate Webpage Draft'}
            </Button>
          </div>
          {latestWebpageDraft && (
            <div className="rounded-md border border-border p-3 text-sm space-y-3">
              <div><span className="font-medium">Saved draft:</span> {latestWebpageDraft.name}</div>
              {latestWebpageDraft.concept && <div><span className="font-medium">Concept:</span> {latestWebpageDraft.concept}</div>}
              {latestWebpageDraft.designDirection && <div><span className="font-medium">Direction:</span> {latestWebpageDraft.designDirection}</div>}
              {latestWebpageDraft.headline && <div><span className="font-medium">Headline:</span> {latestWebpageDraft.headline}</div>}
              {latestWebpageDraft.cta && <div><span className="font-medium">CTA:</span> {latestWebpageDraft.cta}</div>}
              {Array.isArray(latestWebpageDraft.concepts) && latestWebpageDraft.concepts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Three design directions:</span>
                    {latestWebpageDraft.recommendedConcept && (
                      <span className="text-xs rounded-full px-2 py-0.5 bg-orange-600/10 text-orange-600 border border-orange-600/20">
                        Recommended: {latestWebpageDraft.recommendedConcept}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {latestWebpageDraft.concepts.map((concept: any, idx: number) => (
                      <div key={idx} className="rounded-md border border-border p-2 bg-muted/30">
                        <div className="font-medium">{concept.name || concept.direction}</div>
                        {concept.headline && <div className="text-xs mt-1 text-foreground/90">{concept.headline}</div>}
                        {concept.signatureMove && <div className="text-xs text-muted-foreground mt-1">{concept.signatureMove}</div>}
                        {concept.whyItCouldWork && <div className="text-xs mt-2">{concept.whyItCouldWork}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(latestWebpageDraft.sections) && latestWebpageDraft.sections.length > 0 && (
                <div>
                  <span className="font-medium">Sections:</span>
                  <ul className="list-disc ml-5 mt-1 space-y-1 text-muted-foreground">
                    {latestWebpageDraft.sections.slice(0, 6).map((section: string, idx: number) => (
                      <li key={idx}>{section}</li>
                    ))}
                  </ul>
                </div>
              )}
              {latestWebpageDraft.sectionCopy && (
                <div>
                  <span className="font-medium">Section copy guidance:</span>
                  <div className="mt-1 text-muted-foreground space-y-1">
                    {Object.entries(latestWebpageDraft.sectionCopy).slice(0, 5).map(([key, value]: [string, any]) => (
                      <div key={key}><span className="capitalize font-medium text-foreground">{key}:</span> {Array.isArray(value) ? value.join(' • ') : String(value)}</div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(latestWebpageDraft.competitors) && latestWebpageDraft.competitors.length > 0 && (
                <div>
                  <span className="font-medium">Competitor inspiration:</span>
                  <ul className="list-disc ml-5 mt-1 space-y-1 text-muted-foreground">
                    {latestWebpageDraft.competitors.slice(0, 5).map((item: any, idx: number) => (
                      <li key={idx}>
                        <span className="text-foreground">{item.title}</span>
                        {item.url && <span className="text-xs ml-1">({item.url})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {latestWebpageDraft.competitorSummary && (
                <div>
                  <span className="font-medium">Competitor insight summary:</span>
                  <div className="mt-1 space-y-1 text-muted-foreground">
                    {Object.entries(latestWebpageDraft.competitorSummary).map(([key, value]: [string, any]) => (
                      Array.isArray(value) && value.length > 0 ? (
                        <div key={key}>
                          <span className="capitalize font-medium text-foreground">{key.replace(/([A-Z])/g, ' $1').trim()}:</span> {value.slice(0, 4).join(' • ')}
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(latestWebpageDraft.competitorIdeas) && latestWebpageDraft.competitorIdeas.length > 0 && (
                <div>
                  <span className="font-medium">Borrowable ideas:</span>
                  <ul className="list-disc ml-5 mt-1 space-y-1 text-muted-foreground">
                    {latestWebpageDraft.competitorIdeas.slice(0, 5).map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {latestWebpageDraft.pageDraft && (
                <div>
                  <span className="font-medium">Implementation-ready page draft:</span>
                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 space-y-2 text-muted-foreground">
                    {latestWebpageDraft.pageDraft.hero && (
                      <div>
                        <span className="font-medium text-foreground">Hero:</span>{' '}
                        {[latestWebpageDraft.pageDraft.hero.eyebrow, latestWebpageDraft.pageDraft.hero.headline, latestWebpageDraft.pageDraft.hero.subheadline].filter(Boolean).join(' • ')}
                      </div>
                    )}
                    {Array.isArray(latestWebpageDraft.pageDraft.proofItems) && latestWebpageDraft.pageDraft.proofItems.length > 0 && (
                      <div><span className="font-medium text-foreground">Proof:</span> {latestWebpageDraft.pageDraft.proofItems.join(' • ')}</div>
                    )}
                    {Array.isArray(latestWebpageDraft.pageDraft.services) && latestWebpageDraft.pageDraft.services.length > 0 && (
                      <div><span className="font-medium text-foreground">Services:</span> {latestWebpageDraft.pageDraft.services.slice(0, 3).join(' • ')}</div>
                    )}
                    {Array.isArray(latestWebpageDraft.pageDraft.processSteps) && latestWebpageDraft.pageDraft.processSteps.length > 0 && (
                      <div><span className="font-medium text-foreground">Process:</span> {latestWebpageDraft.pageDraft.processSteps.join(' → ')}</div>
                    )}
                    {Array.isArray(latestWebpageDraft.pageDraft.faq) && latestWebpageDraft.pageDraft.faq.length > 0 && (
                      <div><span className="font-medium text-foreground">FAQ angles:</span> {latestWebpageDraft.pageDraft.faq.join(' • ')}</div>
                    )}
                    {latestWebpageDraft.pageDraft.finalCta && (
                      <div><span className="font-medium text-foreground">Final CTA:</span> {[latestWebpageDraft.pageDraft.finalCta.headline, latestWebpageDraft.pageDraft.finalCta.action, latestWebpageDraft.pageDraft.finalCta.reassurance].filter(Boolean).join(' • ')}</div>
                    )}
                    {Array.isArray(latestWebpageDraft.pageDraft.componentSuggestions) && latestWebpageDraft.pageDraft.componentSuggestions.length > 0 && (
                      <div><span className="font-medium text-foreground">Suggested components:</span> {latestWebpageDraft.pageDraft.componentSuggestions.join(' • ')}</div>
                    )}
                  </div>
                </div>
              )}
              {latestWebpageDraft.pageCodeDraft && (
                <div>
                  <span className="font-medium">Code draft:</span>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-border bg-black/90 p-3 text-xs text-green-200 whitespace-pre-wrap">
{latestWebpageDraft.pageCodeDraft}
                  </pre>
                </div>
              )}
              {latestWebpageDraft.seoLayer && (
                <div>
                  <span className="font-medium">SEO + AISO layer:</span>
                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 space-y-2 text-muted-foreground text-xs">
                    {latestWebpageDraft.seoLayer.suggestedTitle && <div><span className="font-medium text-foreground">Title:</span> {latestWebpageDraft.seoLayer.suggestedTitle}</div>}
                    {latestWebpageDraft.seoLayer.suggestedMeta && <div><span className="font-medium text-foreground">Meta:</span> {latestWebpageDraft.seoLayer.suggestedMeta}</div>}
                    {latestWebpageDraft.seoLayer.h1 && <div><span className="font-medium text-foreground">H1:</span> {latestWebpageDraft.seoLayer.h1}</div>}
                    {Array.isArray(latestWebpageDraft.seoLayer.h2s) && latestWebpageDraft.seoLayer.h2s.length > 0 && <div><span className="font-medium text-foreground">H2s:</span> {latestWebpageDraft.seoLayer.h2s.join(' • ')}</div>}
                    {latestWebpageDraft.seoLayer.schemaType && <div><span className="font-medium text-foreground">Schema:</span> {latestWebpageDraft.seoLayer.schemaType}</div>}
                    {Array.isArray(latestWebpageDraft.seoLayer.faqQuestions) && latestWebpageDraft.seoLayer.faqQuestions.length > 0 && <div><span className="font-medium text-foreground">FAQ:</span> {latestWebpageDraft.seoLayer.faqQuestions.join(' • ')}</div>}
                    {Array.isArray(latestWebpageDraft.seoLayer.internalLinkOpportunities) && latestWebpageDraft.seoLayer.internalLinkOpportunities.length > 0 && <div><span className="font-medium text-foreground">Internal links:</span> {latestWebpageDraft.seoLayer.internalLinkOpportunities.join(' • ')}</div>}
                  </div>
                </div>
              )}
              {latestWebpageDraft.notes && <div className="text-muted-foreground">{latestWebpageDraft.notes}</div>}
            </div>
          )}
        </CardContent>
      </Card>



      <div className="grid gap-6 2xl:grid-cols-[1fr_1.1fr] items-start">
        <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO + AISO Audit</CardTitle>
          <CardDescription>
            Run a combined traditional SEO and AI-search audit from the project page and generate a dark client-ready report with fix prompts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={seoUrl}
            onChange={(e) => setSeoUrl(e.target.value)}
            placeholder={p.liveUrl || p.previewUrl || 'https://example.com'}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Uses the project site by default if available. Current phase generates the audit report and fix prompts; selective/apply-all fixes will be the next phase.
            </p>
            <div className="flex items-center gap-2">
              <Link href="/seo" className="text-sm text-cyan-400 hover:underline">Open standalone page</Link>
              <Button onClick={generateSeoAudit} disabled={generatingSeo || !(seoUrl.trim() || p.liveUrl || p.previewUrl)}>
                {generatingSeo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                {generatingSeo ? 'Running Audit…' : 'Run SEO Audit'}
              </Button>
            </div>
          </div>
          {latestSeoReport && (
            <div className="rounded-md border border-border p-3 text-sm space-y-2">
              <div><span className="font-medium">Latest report:</span> {latestSeoReport.title}</div>
              <div><span className="font-medium">Score:</span> {latestSeoReport.combinedScore}/100 ({latestSeoReport.combinedGrade})</div>
              <div><span className="font-medium">SEO:</span> {latestSeoReport.seoScore} • <span className="font-medium">AISO:</span> {latestSeoReport.aisoScore}</div>
              {latestSeoReport.summary && <div className="text-muted-foreground">{latestSeoReport.summary}</div>}
              {Array.isArray(latestSeoReport.quickWins) && latestSeoReport.quickWins.length > 0 && (
                <div><span className="font-medium">Quick wins:</span> {latestSeoReport.quickWins.slice(0, 4).join(' • ')}</div>
              )}
              {Array.isArray(latestSeoReport.findings) && latestSeoReport.findings.length > 0 && (
                <div><span className="font-medium">Top findings:</span> {latestSeoReport.findings.slice(0, 4).map((f) => `[${f.priority}] ${f.issue}`).join(' • ')}</div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <Link href={latestSeoReport.shareUrl || `/seo-reports/${latestSeoReport.id}`} className="text-cyan-400 hover:underline">Open report</Link>
                <span className="text-xs text-muted-foreground">here.now publishing pending integration</span>
              </div>
            </div>
          )}
          {seoReports.length > 1 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Recent project reports</div>
              {seoReports.slice(0, 5).map((report) => (
                <div key={report.id} className="rounded-md border border-border p-2 text-sm flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{report.title}</div>
                    <div className="text-xs text-muted-foreground">{report.combinedScore}/100 • {report.createdAt || ''}</div>
                  </div>
                  <Link href={report.shareUrl || `/seo-reports/${report.id}`} className="text-cyan-400 hover:underline">View</Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        </Card>


        <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Deck Draft</CardTitle>
          <CardDescription>
            Build a source-selectable slide-deck outline from project, brain, client, and webpage context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={deckType} onChange={(e) => setDeckType(e.target.value)} placeholder="Deck type, e.g. pitch-deck, client-proposal, investor-summary, project-update" />
          <textarea
            value={deckPrompt}
            onChange={(e) => setDeckPrompt(e.target.value)}
            placeholder="Example: Create a concise investor-style deck for this project focused on opportunity, differentiation, traction, and next step."
            className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="grid gap-2 md:grid-cols-2 text-sm text-muted-foreground">
            {Object.entries(deckSources).map(([key, value]) => (
              <label key={key} className="flex items-center gap-2">
                <input type="checkbox" checked={value} onChange={(e) => setDeckSources((prev) => ({ ...prev, [key]: e.target.checked }))} />
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
            ))}
          </div>
          <Input value={deckVisualStylePreset} onChange={(e) => setDeckVisualStylePreset(e.target.value)} placeholder="Visual style preset, e.g. dark modern strategic, premium minimal, cinematic technical" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Phase 3 adds saved visual prompts: a cover prompt plus per-slide image prompts you can use for later slide rendering.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={reuseDeckSettings} disabled={!latestDeck}>
                Reuse Latest Settings
              </Button>
              <Button variant="outline" onClick={generateDeckVisualPrompts} disabled={generatingDeckVisuals || !latestDeck}>
                {generatingDeckVisuals ? 'Generating Visuals…' : 'Generate Visual Prompts'}
              </Button>
              <Button onClick={generateDeckDraft} disabled={generatingDeck || !deckPrompt.trim()}>
                {generatingDeck ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                {generatingDeck ? 'Generating Deck…' : 'Generate Deck Draft'}
              </Button>
            </div>
          </div>
          {latestDeck && activeDeck && (
            <div className="rounded-md border border-border p-3 text-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div><span className="font-medium">Deck:</span> {activeDeck.title}</div>
                <div className="flex items-center gap-2">
                  {!editingDeck ? (
                    <Button variant="outline" size="sm" onClick={() => { setDeckDraft(JSON.parse(JSON.stringify(latestDeck))); setEditingDeck(true); }}>
                      Edit Deck
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => { setDeckDraft(JSON.parse(JSON.stringify(latestDeck))); setEditingDeck(false); }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveDeckDraft} disabled={savingDeck}>
                        {savingDeck ? 'Saving…' : 'Save Deck'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editingDeck ? (
                <>
                  <Input value={deckDraft?.title || ''} onChange={(e) => setDeckDraft((prev) => prev ? { ...prev, title: e.target.value } : prev)} placeholder="Deck title" />
                  <Input value={deckDraft?.subtitle || ''} onChange={(e) => setDeckDraft((prev) => prev ? { ...prev, subtitle: e.target.value } : prev)} placeholder="Deck subtitle" />
                  <Input value={deckDraft?.audience || ''} onChange={(e) => setDeckDraft((prev) => prev ? { ...prev, audience: e.target.value } : prev)} placeholder="Audience" />
                  <textarea value={deckDraft?.objective || ''} onChange={(e) => setDeckDraft((prev) => prev ? { ...prev, objective: e.target.value } : prev)} className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Objective" />
                </>
              ) : (
                <>
                  {activeDeck.subtitle && <div><span className="font-medium">Subtitle:</span> {activeDeck.subtitle}</div>}
                  {activeDeck.deckType && <div><span className="font-medium">Type:</span> {activeDeck.deckType}</div>}
                  {activeDeck.audience && <div><span className="font-medium">Audience:</span> {activeDeck.audience}</div>}
                  {activeDeck.objective && <div><span className="font-medium">Objective:</span> {activeDeck.objective}</div>}
                </>
              )}
              {activeDeck.visualStylePreset && <div><span className="font-medium">Visual style:</span> {activeDeck.visualStylePreset}</div>}
              {activeDeck.coverImagePrompt && <div><span className="font-medium">Cover prompt:</span> <span className="text-muted-foreground">{activeDeck.coverImagePrompt}</span></div>}
              {Array.isArray(activeDeck.chosenSources) && activeDeck.chosenSources.length > 0 && <div><span className="font-medium">Sources:</span> {activeDeck.chosenSources.join(' • ')}</div>}
              {Array.isArray(activeDeck.narrativeArc) && activeDeck.narrativeArc.length > 0 && <div><span className="font-medium">Narrative arc:</span> {activeDeck.narrativeArc.join(' → ')}</div>}
              {Array.isArray(activeDeck.slides) && activeDeck.slides.length > 0 && (
                <div>
                  <span className="font-medium">Slides:</span>
                  <div className="mt-2 space-y-2">
                    {(activeDeck.slides || []).slice(0, 12).map((slide, idx) => (
                      <div key={idx} className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{idx + 1}. {slide.title}</div>
                          {editingDeck && (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" onClick={() => moveDeckSlide(idx, -1)} disabled={idx === 0}>↑</Button>
                              <Button size="sm" variant="outline" onClick={() => moveDeckSlide(idx, 1)} disabled={idx === ((deckDraft?.slides?.length || 1) - 1)}>↓</Button>
                              <Button size="sm" variant="outline" onClick={() => removeDeckSlide(idx)}>Remove</Button>
                            </div>
                          )}
                        </div>
                        {editingDeck ? (
                          <div className="space-y-2">
                            <Input value={slide.title || ''} onChange={(e) => updateDeckSlide(idx, 'title', e.target.value)} placeholder="Slide title" />
                            <Input value={slide.purpose || ''} onChange={(e) => updateDeckSlide(idx, 'purpose', e.target.value)} placeholder="Purpose" />
                            <textarea value={Array.isArray(slide.bullets) ? slide.bullets.join('\n') : ''} onChange={(e) => updateDeckSlide(idx, 'bullets', e.target.value)} className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="One bullet per line" />
                            <Input value={slide.visualIdea || ''} onChange={(e) => updateDeckSlide(idx, 'visualIdea', e.target.value)} placeholder="Visual idea" />
                            <textarea value={slide.speakerNotes || ''} onChange={(e) => updateDeckSlide(idx, 'speakerNotes', e.target.value)} className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Speaker notes" />
                          </div>
                        ) : (
                          <>
                            {slide.purpose && <div className="text-xs text-muted-foreground mt-1">{slide.purpose}</div>}
                            {Array.isArray(slide.bullets) && slide.bullets.length > 0 && <div className="text-xs mt-2">{slide.bullets.join(' • ')}</div>}
                            {slide.visualIdea && <div className="text-xs mt-2 text-muted-foreground">Visual: {slide.visualIdea}</div>}
                            {slide.speakerNotes && <div className="text-xs mt-2 text-muted-foreground">Notes: {slide.speakerNotes}</div>}
                            {slide.imagePrompt && <div className="text-xs mt-2 text-cyan-300">Image prompt: {slide.imagePrompt}</div>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
        </Card>

      </div>

      {/* Brain section - always show in edit mode, or when brain has content */}
      {(hasBrain || editing) && (
        <BrainSection
          brain={(editing && draft ? draft.brain : project.brain) || {}}
          editing={editing}
          onChange={(brain) => updateDraft("brain", brain)}
          projectId={id}
        />
      )}

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

      {/* Changelog */}
      <ChangelogSection projectId={id} />

      {/* AI Chat */}
      <ProjectChat projectId={id} projectName={project.name} />
    </div>
  );
}

// ── Changelog Section Component ──
function ChangelogSection({ projectId }: { projectId: string }) {
  const [changelog, setChangelog] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChangelog() {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/changelog`);
        if (res.ok) {
          const text = await res.text();
          setChangelog(text);
        }
      } catch (err) {
        console.error("Failed to load changelog:", err);
      } finally {
        setLoading(false);
      }
    }
    loadChangelog();
  }, [projectId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!changelog) {
    return null;
  }

  // Parse markdown changelog into entries
  const entries = changelog.split(/^## /m).slice(1).slice(0, 5); // Last 5 entries

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Recent Changes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {entries.map((entry, i) => {
            const lines = entry.trim().split('\n');
            const header = lines[0];
            const items = lines.slice(1).filter(l => l.startsWith('-')).map(l => l.substring(2));
            
            return (
              <div key={i} className="border-l-2 border-muted pl-4">
                <p className="text-sm font-medium text-muted-foreground mb-1">{header}</p>
                <ul className="space-y-1">
                  {items.map((item, j) => (
                    <li key={j} className="text-sm">{item}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Live Preview Component ──
type DeviceSize = 'mobile' | 'tablet' | 'desktop';

interface DevicePreset {
  name: string;
  width: number;
  icon: string;
}

const DEVICE_PRESETS: Record<DeviceSize, DevicePreset> = {
  mobile: { name: 'Mobile', width: 375, icon: '📱' },
  tablet: { name: 'Tablet', width: 768, icon: '📱' },
  desktop: { name: 'Desktop', width: 1440, icon: '💻' },
};

function LivePreview({ 
  url, 
  projectName,
  projectId 
}: { 
  url: string; 
  projectName: string;
  projectId: string;
}) {
  const [device, setDevice] = useState<DeviceSize>('desktop');
  const [zoom, setZoom] = useState(100);

  const currentPreset = DEVICE_PRESETS[device];
  const iframeWidth = currentPreset.width;
  
  // Calculate scale to fit smaller devices in the container
  const maxContainerWidth = 1500; // Wider desktop layout for larger project workspace
  const baseScale = device === 'desktop' 
    ? 1 
    : Math.min(1, maxContainerWidth / iframeWidth);
  
  // Apply zoom on top of base scale
  const scale = baseScale * (zoom / 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-3">
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Live Preview
          </span>
          
          {/* Device Size Selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border bg-muted/50 p-1">
              {(Object.keys(DEVICE_PRESETS) as DeviceSize[]).map((size) => {
                const preset = DEVICE_PRESETS[size];
                return (
                  <button
                    key={size}
                    onClick={() => setDevice(size)}
                    className={`
                      px-3 py-1.5 text-xs font-medium rounded-md transition-all
                      ${device === size 
                        ? 'bg-background text-foreground shadow-sm' 
                        : 'text-muted-foreground hover:text-foreground'
                      }
                    `}
                  >
                    <span className="mr-1.5">{preset.icon}</span>
                    {preset.name}
                  </button>
                );
              })}
            </div>
            
            <div className="h-6 w-px bg-border" />
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const iframe = document.getElementById(`preview-${projectId}`) as HTMLIFrameElement;
                if (iframe) iframe.src = iframe.src;
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open
              </Button>
            </a>
          </div>
        </CardTitle>
        
        {/* Zoom Slider */}
        <div className="flex items-center gap-3 pt-2 border-t mt-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Zoom:</span>
          <input
            type="range"
            min="25"
            max="200"
            step="25"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span className="text-xs font-medium text-muted-foreground w-12 text-right">
            {zoom}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(100)}
            disabled={zoom === 100}
            className="h-7 px-2 text-xs"
          >
            Reset
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex justify-center bg-muted/30 rounded-lg p-6">
          <div 
            className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300 ease-out"
            style={{
              width: `${iframeWidth}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
            }}
          >
            <iframe
              id={`preview-${projectId}`}
              src={url}
              className="w-full border-0"
              style={{ height: '800px' }}
              title={`${projectName} Preview`}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <p>
            {currentPreset.name}: {currentPreset.width}px @ {Math.round(scale * 100)}%
          </p>
          <p className="truncate ml-4">{url}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Live Preview with AI Code Changes ──
function LivePreviewWithAI({ 
  url, 
  projectName,
  projectId,
  project
}: { 
  url: string; 
  projectName: string;
  projectId: string;
  project: any;
}) {
  const [showCodeChat, setShowCodeChat] = useState(false);
  const [codeRequest, setCodeRequest] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const handleCodeChange = async () => {
    if (!codeRequest.trim()) return;
    
    setProcessing(true);
    setResult(null);
    
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ai-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          request: codeRequest,
          repoUrl: project.repoUrl,
          branch: project.githubBranch || 'main'
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setResult({ 
          success: true, 
          message: `✅ Changes pushed! PR: ${data.prUrl || 'Creating...'}`
        });
        setCodeRequest('');
        
        // Auto-refresh preview after 3 seconds
        setTimeout(() => {
          const iframe = document.getElementById(`preview-${projectId}`) as HTMLIFrameElement;
          if (iframe) iframe.src = iframe.src;
        }, 3000);
      } else {
        setResult({ 
          success: false, 
          message: `❌ ${data.error || 'Failed to make changes'}`
        });
      }
    } catch (err: any) {
      setResult({ 
        success: false, 
        message: `❌ Network error: ${err.message}`
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <LivePreview 
        url={url}
        projectName={projectName}
        projectId={projectId}
      />
      
      {/* AI Code Changes */}
      {project.repoUrl && (
        <Card className="border-purple-500/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                AI Code Changes
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCodeChat(!showCodeChat)}
              >
                {showCodeChat ? (
                  <>
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Close
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Make Changes
                  </>
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          
          {showCodeChat && (
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Describe the changes you want to make. AI will modify the code and create a PR.
                </p>
                
                <div className="space-y-2">
                  <textarea
                    value={codeRequest}
                    onChange={(e) => setCodeRequest(e.target.value)}
                    placeholder="e.g., 'Change the hero button from blue to purple' or 'Add a footer with social links'"
                    className="w-full min-h-[100px] p-3 text-sm rounded-lg border bg-background resize-y"
                    disabled={processing}
                  />
                  
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCodeChange}
                      disabled={!codeRequest.trim() || processing}
                      className="flex-1"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Apply Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                
                {result && (
                  <div className={`p-3 rounded-lg text-sm ${
                    result.success 
                      ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                      : 'bg-red-500/10 text-red-600 border border-red-500/20'
                  }`}>
                    {result.message}
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <strong>Examples:</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Change button color to green',
                      'Add contact form',
                      'Make navbar sticky',
                      'Update footer text'
                    ].map((example) => (
                      <button
                        key={example}
                        onClick={() => setCodeRequest(example)}
                        disabled={processing}
                        className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
