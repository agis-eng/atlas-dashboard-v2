"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Mail,
  ExternalLink,
  Filter,
  Pencil,
  RefreshCw,
  Sparkles,
  Star,
  StarOff,
  Archive,
  Clock,
  CheckSquare,
  Loader2,
  Inbox,
  BookOpen,
  FileText,
  Plus,
  Trash2,
  Check,
  X,
  Zap,
  Smile,
  Meh,
  AlertTriangle,
  AlignLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailSettingsSheet } from "@/components/email-settings";
import { EmailCompose } from "@/components/email-compose";
import { EmailView, type FullEmail } from "@/components/email-view";

// ── Types ──────────────────────────────────────────────────────────

interface DigestEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  url?: string;
  inbox: string;
}

interface EmailDigest {
  id: string;
  timestamp: string;
  greeting: string;
  inboxes: string[];
  emailCount: number;
  categories: {
    topOfMind: DigestEmail[];
    fyi: DigestEmail[];
    newsletters: DigestEmail[];
  };
}

interface SnoozedEmail {
  emailId: string;
  subject: string;
  from: string;
  snippet: string;
  account: string;
  snoozedAt: string;
  snoozedUntil: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  tags: string[];
  useCount: number;
  createdAt: string;
}

type Tab = "inbox" | "digest" | "snoozed" | "templates";

// ── Digest Mock Data ───────────────────────────────────────────────

const MOCK_DIGESTS: EmailDigest[] = [
  {
    id: "digest-001",
    timestamp: "2026-03-22T08:00:00Z",
    greeting: "Good morning",
    inboxes: ["sales@ted-associates.com", "erik@rcmn.com"],
    emailCount: 9,
    categories: {
      topOfMind: [
        {
          id: "e1",
          subject: "Re: Atlas Dashboard — feedback from investor call",
          from: "anton@ted-associates.com",
          to: "erik@rcmn.com",
          snippet:
            "Hey Erik, the investors loved the demo. They want to schedule a follow-up next week to discuss the roadmap.",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e2",
          subject: "URGENT: SSL cert expiring on openclaw.com",
          from: "alerts@vercel.com",
          to: "erik@rcmn.com",
          snippet:
            "Your SSL certificate for openclaw.com expires in 3 days. Auto-renewal failed — please check your DNS settings.",
          url: "https://vercel.com/dashboard",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e3",
          subject: "New lead: Peterson & Co — contract review request",
          from: "intake@ted-associates.com",
          to: "sales@ted-associates.com",
          snippet:
            "Peterson & Co submitted a contract review request. They have 12 vendor agreements that need analysis by end of month.",
          inbox: "sales@ted-associates.com",
        },
      ],
      fyi: [
        {
          id: "e4",
          subject: "Weekly standup notes — March 22",
          from: "atlas@ted-associates.com",
          to: "team@ted-associates.com",
          snippet:
            "Standup summary: 3 projects in review, 2 new client inquiries, eBay automation on track for Friday deploy.",
          inbox: "sales@ted-associates.com",
        },
        {
          id: "e5",
          subject: "Your Stripe payout has been initiated",
          from: "notifications@stripe.com",
          to: "erik@rcmn.com",
          snippet: "A payout of $4,230.00 has been initiated to your bank account ending in 8842.",
          url: "https://dashboard.stripe.com/payouts",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e6",
          subject: "GitHub: 3 new issues on atlas-dashboard-v2",
          from: "notifications@github.com",
          to: "erik@rcmn.com",
          snippet: "#42 Email digest page, #43 Redis caching layer, #44 Mobile responsive sidebar.",
          url: "https://github.com/eriklaine/atlas-dashboard-v2/issues",
          inbox: "erik@rcmn.com",
        },
      ],
      newsletters: [
        {
          id: "e7",
          subject: "This Week in AI — GPT-5 rumors, Claude updates",
          from: "newsletter@therundown.ai",
          to: "erik@rcmn.com",
          snippet: "Top stories: OpenAI reportedly testing GPT-5 internally, Anthropic ships Claude 4.6.",
          url: "https://therundown.ai/latest",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e8",
          subject: "Hacker News Digest — Top 10 stories",
          from: "digest@hndigest.com",
          to: "erik@rcmn.com",
          snippet:
            "1. Show HN: I built a local-first CRM in Rust. 2. Why SQLite is the future of edge computing.",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e9",
          subject: "SaaS Weekly: Churn benchmarks for 2026",
          from: "hello@saasweekly.com",
          to: "sales@ted-associates.com",
          snippet: "Average monthly churn for B2B SaaS dropped to 3.2% in Q1 2026.",
          inbox: "sales@ted-associates.com",
        },
      ],
    },
  },
  {
    id: "digest-002",
    timestamp: "2026-03-21T17:00:00Z",
    greeting: "Good evening",
    inboxes: ["erik@rcmn.com"],
    emailCount: 5,
    categories: {
      topOfMind: [
        {
          id: "e10",
          subject: "Re: OpenClaw contract parser — production bug",
          from: "anton@ted-associates.com",
          to: "erik@rcmn.com",
          snippet:
            "Found the issue — the PDF parser chokes on scanned documents with mixed orientations. Fix pushed to staging.",
          inbox: "erik@rcmn.com",
        },
      ],
      fyi: [
        {
          id: "e11",
          subject: "Vercel deploy succeeded: atlas-dashboard-v2",
          from: "notifications@vercel.com",
          to: "erik@rcmn.com",
          snippet: "Production deployment completed for commit c69d272. Build time: 34s.",
          url: "https://vercel.com/deployments",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e12",
          subject: "Upstash Redis usage alert — 80% quota",
          from: "alerts@upstash.com",
          to: "erik@rcmn.com",
          snippet:
            "Your Redis database 'atlas-prod' has used 80% of its monthly command quota.",
          inbox: "erik@rcmn.com",
        },
      ],
      newsletters: [
        {
          id: "e13",
          subject: "Tailwind CSS v4.1 released",
          from: "updates@tailwindcss.com",
          to: "erik@rcmn.com",
          snippet: "New in v4.1: Container queries support, improved dark mode variants, 30% faster builds.",
          url: "https://tailwindcss.com/blog/v4-1",
          inbox: "erik@rcmn.com",
        },
        {
          id: "e14",
          subject: "Next.js Weekly — App Router deep dive",
          from: "newsletter@nextjs.org",
          to: "erik@rcmn.com",
          snippet: "Server Actions best practices, streaming SSR patterns, and migrating from Pages Router.",
          inbox: "erik@rcmn.com",
        },
      ],
    },
  },
];

// ── Category Config ────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: "topOfMind" as const,
    label: "Top of Mind",
    emoji: "🚨",
    color: "bg-red-500/10 text-red-600 dark:text-red-400",
    dotColor: "bg-red-500",
  },
  {
    key: "fyi" as const,
    label: "FYI",
    emoji: "📝",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dotColor: "bg-blue-500",
  },
  {
    key: "newsletters" as const,
    label: "Newsletters",
    emoji: "📰",
    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
    dotColor: "bg-gray-400",
  },
];

// ── Helpers ────────────────────────────────────────────────────────

function formatDigestTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7)
    return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSnoozeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return "past due";
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHours < 1) return "< 1 hour";
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sentimentIcon(s: string) {
  if (s === "urgent") return <Zap className="h-3 w-3 text-red-500" />;
  if (s === "angry") return <AlertTriangle className="h-3 w-3 text-orange-500" />;
  if (s === "positive") return <Smile className="h-3 w-3 text-green-500" />;
  return <Meh className="h-3 w-3 text-muted-foreground" />;
}

// Group emails into threads by subject (strip Re:/Fwd: prefixes)
function getThreadKey(subject: string): string {
  return subject.replace(/^(Re|Fwd|FW|RE):\s*/gi, "").trim().toLowerCase();
}

// ── Digest Components ──────────────────────────────────────────────

function DigestEmailItem({ email }: { email: DigestEmail }) {
  return (
    <div className="group rounded-lg border border-border/50 bg-card/50 p-3 transition-all hover:border-border hover:bg-card hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {email.url ? (
            <a
              href={email.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium hover:text-orange-600 transition-colors"
            >
              <span className="truncate">{email.subject}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ) : (
            <p className="text-sm font-medium truncate">{email.subject}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground truncate">From: {email.from}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {email.inbox.split("@")[0]}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {email.snippet}
      </p>
    </div>
  );
}

function CategorySection({
  category,
  emails,
  defaultOpen = true,
}: {
  category: (typeof CATEGORIES)[number];
  emails: DigestEmail[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (emails.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-base">{category.emoji}</span>
        <span className="text-sm font-semibold">{category.label}</span>
        <span
          className={cn(
            "ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            category.color
          )}
        >
          {emails.length}
        </span>
      </button>
      {open && (
        <div className="ml-6 mt-2 space-y-2">
          {emails.map((email) => (
            <DigestEmailItem key={email.id} email={email} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestCard({ digest }: { digest: EmailDigest }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <Card className="transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 text-left"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <CardTitle className="text-lg">
                {digest.greeting},{" "}
                <span className="text-orange-600">Erik</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDigestTime(digest.timestamp)} &middot; {digest.emailCount} emails across{" "}
                {digest.inboxes.length} inbox{digest.inboxes.length > 1 ? "es" : ""}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1">
            {digest.inboxes.map((inbox) => (
              <span
                key={inbox}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {inbox}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {CATEGORIES.map((cat) => (
            <CategorySection
              key={cat.key}
              category={cat}
              emails={digest.categories[cat.key]}
              defaultOpen={cat.key === "topOfMind"}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ── Inbox Components ───────────────────────────────────────────────

function InboxEmailRow({
  email,
  selected,
  onSelect,
  onOpen,
  onStar,
}: {
  email: FullEmail;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (email: FullEmail) => void;
  onStar: (id: string, starred: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-muted/40",
        !email.read && "bg-blue-50/50 dark:bg-blue-950/10",
        selected && "bg-orange-50 dark:bg-orange-950/20"
      )}
      onClick={() => onOpen(email)}
    >
      {/* Checkbox */}
      <div
        className="shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(email.id, !selected);
        }}
      >
        <div
          className={cn(
            "h-4 w-4 rounded border-2 flex items-center justify-center transition-colors",
            selected
              ? "bg-orange-600 border-orange-600"
              : "border-muted-foreground/40 hover:border-muted-foreground"
          )}
        >
          {selected && <Check className="h-2.5 w-2.5 text-white" />}
        </div>
      </div>

      {/* Star */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStar(email.id, !email.starred);
        }}
        className="shrink-0 text-muted-foreground/40 hover:text-yellow-500 transition-colors"
      >
        {email.starred ? (
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        ) : (
          <StarOff className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Unread dot */}
      <div className="shrink-0 w-2 flex justify-center">
        {!email.read && (
          <div className="h-2 w-2 rounded-full bg-blue-500" />
        )}
      </div>

      {/* From */}
      <div
        className={cn(
          "shrink-0 w-36 text-sm truncate",
          !email.read && "font-semibold"
        )}
      >
        {email.from.replace(/<.*>/, "").trim() || email.from}
      </div>

      {/* Subject + Snippet */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={cn("text-sm truncate", !email.read && "font-semibold")}
        >
          {email.subject}
        </span>
        <span className="text-xs text-muted-foreground truncate hidden sm:block">
          — {email.snippet}
        </span>
      </div>

      {/* AI Badges */}
      <div className="shrink-0 flex items-center gap-1">
        {email.aiCategory && (
          <span
            className={cn(
              "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
              email.aiCategory === "topOfMind"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : email.aiCategory === "fyi"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            {email.aiCategory === "topOfMind"
              ? "🚨"
              : email.aiCategory === "fyi"
              ? "📝"
              : "📰"}
          </span>
        )}
        {email.aiSentiment && email.aiSentiment !== "neutral" && (
          <span className="shrink-0">{sentimentIcon(email.aiSentiment)}</span>
        )}
      </div>

      {/* Date */}
      <div className="shrink-0 w-16 text-xs text-muted-foreground text-right">
        {formatRelativeDate(email.date)}
      </div>
    </div>
  );
}

// ── Template Components ────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!newName.trim() || !newBody.trim()) return;
    setCreating(false);
    try {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          subject: newSubject,
          body: newBody,
        }),
      });
      const data = await res.json();
      if (data.template) {
        setTemplates((prev) => [...prev, data.template]);
        setNewName("");
        setNewSubject("");
        setNewBody("");
      }
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/email/templates?id=${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? "s" : ""}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCreating(!creating)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New Template
        </Button>
      </div>

      {/* Create Form */}
      {creating && (
        <Card className="border-orange-200 dark:border-orange-800/50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">New Template</p>
            <Input
              placeholder="Template name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm"
            />
            <Input
              placeholder="Subject line (optional)"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="h-8 text-sm"
            />
            <textarea
              placeholder="Template body..."
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} className="bg-orange-600 hover:bg-orange-700">
                Save Template
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                  setNewSubject("");
                  setNewBody("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template List */}
      <div className="space-y-3">
        {templates.map((t) => (
          <Card key={t.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-orange-600 shrink-0" />
                    <p className="font-medium">{t.name}</p>
                    {t.useCount > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {t.useCount}× used
                      </span>
                    )}
                  </div>
                  {t.subject && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Subject: {t.subject}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2 whitespace-pre-line">
                    {t.body}
                  </p>
                  {t.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {t.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  disabled={deleting === t.id}
                  className="shrink-0 p-1.5 text-muted-foreground hover:text-red-600 transition-colors rounded hover:bg-red-50 dark:hover:bg-red-950/20"
                >
                  {deleting === t.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && !creating && (
        <div className="flex flex-col items-center py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No templates yet</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setCreating(true)}
          >
            Create your first template
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Snoozed Tab ────────────────────────────────────────────────────

function SnoozedTab({ onUnsnooze }: { onUnsnooze: () => void }) {
  const [snoozes, setSnoozes] = useState<SnoozedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSnoozes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/snooze");
      const data = await res.json();
      setSnoozes(data.snoozes || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnoozes();
  }, [fetchSnoozes]);

  const handleUnsnooze = async (emailId: string) => {
    try {
      await fetch(`/api/email/snooze?emailId=${emailId}`, { method: "DELETE" });
      setSnoozes((prev) => prev.filter((s) => s.emailId !== emailId));
      onUnsnooze();
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (snoozes.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No snoozed emails</p>
        <p className="text-xs text-muted-foreground mt-1">
          Snooze emails to bring them back at the right time
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {snoozes.map((snooze) => (
        <div
          key={snooze.emailId}
          className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 p-3 hover:border-border hover:bg-card transition-colors"
        >
          <Clock className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{snooze.subject}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              From: {snooze.from}
            </p>
            {snooze.snippet && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {snooze.snippet}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-xs font-medium text-orange-600">
              {formatSnoozeTime(snooze.snoozedUntil)}
            </span>
            <div>
              <button
                onClick={() => handleUnsnooze(snooze.emailId)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                Unsnooze
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Inbox Tab ─────────────────────────────────────────────────────

function InboxTab() {
  const [emails, setEmails] = useState<FullEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewEmail, setViewEmail] = useState<FullEmail | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [aiTriaging, setAiTriaging] = useState(false);
  const [compose, setCompose] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/email-fetch");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch");
      }
      const data = await res.json();
      setEmails(
        (data.emails || []).map((e: FullEmail) => ({
          ...e,
          read: false,
          starred: false,
        }))
      );
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Don't auto-fetch on load — let user click Refresh to avoid IMAP connection on page load

  const runBulkTriage = useCallback(async () => {
    if (emails.length === 0) return;
    setAiTriaging(true);
    try {
      const emailInputs = emails.slice(0, 30).map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        to: e.to,
        snippet: e.snippet || e.body?.substring(0, 150) || "",
      }));
      const res = await fetch("/api/email/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-triage", emails: emailInputs }),
      });
      const data = await res.json();
      if (data.results) {
        const map: Record<string, { category: string; summary: string; sentiment: string }> = {};
        for (const r of data.results) map[r.id] = r;
        setEmails((prev) =>
          prev.map((e) =>
            map[e.id]
              ? {
                  ...e,
                  aiCategory: map[e.id].category as FullEmail["aiCategory"],
                  aiSummary: map[e.id].summary,
                  aiSentiment: map[e.id].sentiment as FullEmail["aiSentiment"],
                }
              : e
          )
        );
      }
    } catch {
      // silently fail
    } finally {
      setAiTriaging(false);
    }
  }, [emails]);

  // Keyboard shortcuts (Gmail-like)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't fire when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement).isContentEditable
      )
        return;
      if (viewEmail) return; // Let EmailView handle keys when open

      switch (e.key) {
        case "c":
          e.preventDefault();
          setCompose(true);
          break;
        case "r":
          if (viewEmail) e.preventDefault();
          break;
        case "/":
          e.preventDefault();
          document.getElementById("inbox-search")?.focus();
          break;
        case "Escape":
          setViewEmail(null);
          setSelected(new Set());
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [viewEmail]);

  // Filter emails — must be before callbacks that reference it
  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      const matchesSearch =
        !search ||
        e.subject.toLowerCase().includes(search.toLowerCase()) ||
        e.from.toLowerCase().includes(search.toLowerCase()) ||
        (e.snippet || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.body || "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || e.aiCategory === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [emails, search, categoryFilter]);

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filteredEmails.length
        ? new Set()
        : new Set(filteredEmails.map((e) => e.id))
    );
  }, [filteredEmails]);

  const handleStar = useCallback((id: string, starred: boolean) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, starred } : e)));
    if (viewEmail?.id === id) setViewEmail((prev) => prev ? { ...prev, starred } : prev);
  }, [viewEmail]);

  const handleArchive = useCallback((id: string) => {
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (viewEmail?.id === id) setViewEmail(null);
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }, [viewEmail]);

  const handleBulkArchive = useCallback(() => {
    setEmails((prev) => prev.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
  }, [selected]);

  const handleMarkRead = useCallback((ids?: Set<string>) => {
    const targets = ids || selected;
    setEmails((prev) =>
      prev.map((e) => (targets.has(e.id) ? { ...e, read: true } : e))
    );
    setSelected(new Set());
  }, [selected]);

  const handleOpenEmail = useCallback((email: FullEmail) => {
    setViewEmail(email);
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
    );
  }, []);

  const handleSnooze = useCallback((id: string) => {
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (viewEmail?.id === id) setViewEmail(null);
  }, [viewEmail]);

  const unreadCount = emails.filter((e) => !e.read).length;
  const allSelected = selected.size > 0 && selected.size === filteredEmails.length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="inbox-search"
            placeholder="Search inbox... (/)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All</option>
          <option value="topOfMind">🚨 Top of Mind</option>
          <option value="fyi">📝 FYI</option>
          <option value="newsletters">📰 Newsletters</option>
        </select>

        <Button
          size="sm"
          variant="outline"
          onClick={fetchEmails}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>

        {emails.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={runBulkTriage}
            disabled={aiTriaging}
            className="gap-1.5 text-orange-600 border-orange-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20"
          >
            {aiTriaging ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI Triage
          </Button>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 px-3 py-2">
          <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleMarkRead()}
            className="h-7 text-xs gap-1"
          >
            <Check className="h-3 w-3" />
            Mark read
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleBulkArchive}
            className="h-7 text-xs gap-1"
          >
            <Archive className="h-3 w-3" />
            Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="h-7 text-xs"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Email List */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* List Header */}
        {filteredEmails.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b border-border">
            <div
              onClick={toggleSelectAll}
              className={cn(
                "h-4 w-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors shrink-0",
                allSelected
                  ? "bg-orange-600 border-orange-600"
                  : "border-muted-foreground/40 hover:border-muted-foreground"
              )}
            >
              {allSelected && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <span className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"} · {filteredEmails.length} emails
            </span>
          </div>
        )}

        {/* Rows */}
        {filteredEmails.length > 0 ? (
          filteredEmails.map((email) => (
            <InboxEmailRow
              key={email.id}
              email={email}
              selected={selected.has(email.id)}
              onSelect={toggleSelect}
              onOpen={handleOpenEmail}
              onStar={handleStar}
            />
          ))
        ) : loadError ? (
          <div className="flex flex-col items-center py-16 text-center px-6">
            <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium">Couldn&apos;t connect to inbox</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">{loadError}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Configure your SMTP/IMAP credentials in Settings to connect your inbox.
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={fetchEmails}>
              Try again
            </Button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-orange-600 mb-2" />
            <p className="text-sm text-muted-foreground">Connecting to inbox...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-16 text-center px-6">
            <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search || categoryFilter !== "all" ? "No matching emails" : "Click Refresh to load your inbox"}
            </p>
            {(search || categoryFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Keyboard shortcut hint */}
      <p className="text-xs text-muted-foreground/60 text-center">
        Press <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">c</kbd> to compose &nbsp;·&nbsp;
        <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">/</kbd> to search &nbsp;·&nbsp;
        <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">Esc</kbd> to close
      </p>

      {/* Email View Panel */}
      {viewEmail && (
        <EmailView
          email={viewEmail}
          onClose={() => setViewEmail(null)}
          onStarToggle={handleStar}
          onArchive={handleArchive}
          onSnooze={handleSnooze}
        />
      )}

      {/* Compose Modal */}
      {compose && (
        <EmailCompose
          mode="compose"
          onClose={() => setCompose(false)}
          onSent={() => setCompose(false)}
        />
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function EmailPage() {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("inbox");
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Digest tab state
  const [search, setSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const allInboxes = useMemo(() => {
    const set = new Set<string>();
    MOCK_DIGESTS.forEach((d) => d.inboxes.forEach((i) => set.add(i)));
    return Array.from(set).sort();
  }, []);

  const filteredDigests = useMemo(() => {
    return MOCK_DIGESTS.map((digest) => {
      const filterEmails = (emails: DigestEmail[]) =>
        emails.filter((email) => {
          const matchesSearch =
            !search ||
            email.subject.toLowerCase().includes(search.toLowerCase()) ||
            email.from.toLowerCase().includes(search.toLowerCase()) ||
            email.snippet.toLowerCase().includes(search.toLowerCase());
          const matchesInbox =
            inboxFilter === "all" || email.inbox === inboxFilter;
          return matchesSearch && matchesInbox;
        });

      const filtered = {
        ...digest,
        categories: {
          topOfMind: filterEmails(digest.categories.topOfMind),
          fyi: filterEmails(digest.categories.fyi),
          newsletters: filterEmails(digest.categories.newsletters),
        },
      };

      if (categoryFilter !== "all") {
        const keys = ["topOfMind", "fyi", "newsletters"] as const;
        for (const key of keys) {
          if (key !== categoryFilter) filtered.categories[key] = [];
        }
      }

      filtered.emailCount =
        filtered.categories.topOfMind.length +
        filtered.categories.fyi.length +
        filtered.categories.newsletters.length;

      return filtered;
    }).filter((d) => d.emailCount > 0);
  }, [search, inboxFilter, categoryFilter]);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "inbox", label: "Inbox", icon: <Inbox className="h-3.5 w-3.5" /> },
    { key: "digest", label: "Digest", icon: <AlignLeft className="h-3.5 w-3.5" /> },
    { key: "snoozed", label: "Snoozed", icon: <Clock className="h-3.5 w-3.5" /> },
    { key: "templates", label: "Templates", icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div
        className={`transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600/10">
              <Mail className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
              <p className="text-sm text-muted-foreground">
                Inbox, digests, and AI-powered email management
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setComposing(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compose</span>
            </Button>
            <EmailSettingsSheet />
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div
        className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ transitionDelay: "50ms" }}
      >
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === t.key
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div
        className={`transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ transitionDelay: "100ms" }}
      >
        {/* Inbox */}
        {tab === "inbox" && <InboxTab />}

        {/* Digest */}
        {tab === "digest" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search digests..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={inboxFilter}
                  onChange={(e) => setInboxFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Inboxes</option>
                  {allInboxes.map((inbox) => (
                    <option key={inbox} value={inbox}>
                      {inbox}
                    </option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Categories</option>
                  <option value="topOfMind">🚨 Top of Mind</option>
                  <option value="fyi">📝 FYI</option>
                  <option value="newsletters">📰 Newsletters</option>
                </select>
              </div>
            </div>

            {/* Digest Cards */}
            <div className="space-y-4">
              {filteredDigests.map((digest) => (
                <DigestCard key={digest.id} digest={digest} />
              ))}
              {filteredDigests.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No digests match your filters</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setSearch("");
                      setInboxFilter("all");
                      setCategoryFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Snoozed */}
        {tab === "snoozed" && (
          <SnoozedTab onUnsnooze={() => {}} />
        )}

        {/* Templates */}
        {tab === "templates" && <TemplatesTab />}
      </div>

      {/* Global Compose */}
      {composing && (
        <EmailCompose
          mode="compose"
          onClose={() => setComposing(false)}
          onSent={() => setComposing(false)}
        />
      )}
    </div>
  );
}
