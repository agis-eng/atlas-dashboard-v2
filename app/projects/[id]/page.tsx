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
} from "lucide-react";
import { ProjectChat } from "@/components/project-chat";
import { ProjectCalls } from "@/components/project-calls";

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
  const [voiceMemos, setVoiceMemos] = useState<Array<{
    id: string;
    title: string;
    date: string;
    speakers: string;
    summary: string;
    topics: string[];
    actionItems: string[];
    keyDecisions?: string[];
    sentiment?: string;
  }>>([]);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
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
        
        // Load voice memos linked to this project
        try {
          const memosRes = await fetch("/api/voice-memos");
          if (memosRes.ok) {
            const memosData = await memosRes.json();
            const linked = (memosData.memos || []).filter(
              (m: any) => m.projectMatch === id || m.clientMatch === id
            );
            setVoiceMemos(linked);
          }
        } catch {}

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
                  <button
                    onClick={async () => {
                      const cycle = ["", "low", "medium", "high"];
                      const currentIdx = cycle.indexOf(p.priority || "");
                      const next = cycle[(currentIdx + 1) % cycle.length];
                      // Optimistic update
                      setProject({ ...project!, priority: next || undefined });
                      try {
                        const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ priority: next }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setProject(data.project);
                          setToast({ message: next ? `Priority set to ${next}` : "Priority cleared", type: "success" });
                        }
                      } catch {
                        setProject(project);
                      }
                    }}
                    className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium uppercase cursor-pointer hover:ring-2 hover:ring-ring/50 transition-all ${
                      p.priority === "high"
                        ? "bg-red-500/10 text-red-500"
                        : p.priority === "medium"
                          ? "bg-yellow-500/10 text-yellow-500"
                          : p.priority === "low"
                            ? "bg-muted text-muted-foreground"
                            : "bg-muted/50 text-muted-foreground/60 border border-dashed border-border"
                    }`}
                  >
                    {p.priority || "priority"}
                  </button>
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
            </div>
            {/* Client Contact Info */}
            {!editing && clientContact && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Client Contact</p>
                  {clientContact.name && (
                    <p className="text-sm font-medium mb-1">{clientContact.name}</p>
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

      {/* Brain section - always show in edit mode, or when brain has content */}
      {(hasBrain || editing) && (
        <BrainSection
          brain={(editing && draft ? draft.brain : project.brain) || {}}
          editing={editing}
          onChange={(brain) => updateDraft("brain", brain)}
          projectId={id}
        />
      )}

      {/* Voice Memos linked to this project */}
      {voiceMemos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              Voice Memos ({voiceMemos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {voiceMemos.map((memo) => (
              <div key={memo.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{memo.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(memo.date).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{memo.speakers}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{memo.summary}</p>
                {memo.actionItems && memo.actionItems.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mt-2 mb-1">Action Items</p>
                    <ul className="space-y-0.5">
                      {memo.actionItems.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-orange-500 shrink-0">-</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {memo.keyDecisions && memo.keyDecisions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mt-2 mb-1">Key Decisions</p>
                    <ul className="space-y-0.5">
                      {memo.keyDecisions.map((d, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-green-500 shrink-0">-</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {memo.topics && memo.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {memo.topics.map((t, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
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

      {/* Calls */}
      <ProjectCalls projectId={id} />

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
  const maxContainerWidth = 1200; // Approximate max width of card content
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
