"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Reply,
  ReplyAll,
  Forward,
  Star,
  StarOff,
  Archive,
  Trash2,
  Clock,
  CheckSquare,
  Sparkles,
  X,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Smile,
  Meh,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailCompose, type ComposeMode, type ComposeEmail } from "./email-compose";

// ── Types ─────────────────────────────────────────────────────────

export interface FullEmail {
  id: string;
  uid?: number;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  account: string;
  // AI-enriched fields
  aiCategory?: "topOfMind" | "fyi" | "newsletters";
  aiSummary?: string;
  aiSentiment?: "urgent" | "angry" | "positive" | "neutral";
  aiPriority?: "high" | "medium" | "low";
}

interface Props {
  email: FullEmail;
  onClose: () => void;
  onStarToggle?: (id: string, starred: boolean) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSnooze?: (id: string, until: string) => void;
  onTaskCreated?: (task: Record<string, string>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    urgent: {
      icon: <Zap className="h-3 w-3" />,
      label: "Urgent",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    angry: {
      icon: <AlertTriangle className="h-3 w-3" />,
      label: "Needs care",
      className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    },
    positive: {
      icon: <Smile className="h-3 w-3" />,
      label: "Positive",
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
    neutral: {
      icon: <Meh className="h-3 w-3" />,
      label: "Neutral",
      className: "bg-muted text-muted-foreground",
    },
  };
  const config = configs[sentiment] || configs.neutral;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
        config.className
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const configs: Record<string, { emoji: string; label: string; className: string }> = {
    topOfMind: {
      emoji: "🚨",
      label: "Top of Mind",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    fyi: {
      emoji: "📝",
      label: "FYI",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    },
    newsletters: {
      emoji: "📰",
      label: "Newsletter",
      className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    },
  };
  const config = configs[category];
  if (!config) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
        config.className
      )}
    >
      {config.emoji} {config.label}
    </span>
  );
}

// ── Snooze Picker ─────────────────────────────────────────────────

function SnoozePicker({
  onSnooze,
  onClose,
}: {
  onSnooze: (until: string) => void;
  onClose: () => void;
}) {
  const options = [
    { label: "In 1 hour", hours: 1 },
    { label: "Later today (4 hours)", hours: 4 },
    { label: "Tomorrow morning", hours: 16 },
    { label: "This weekend", hours: 48 },
    { label: "Next week", hours: 7 * 24 },
  ];

  return (
    <div className="absolute top-full mt-1 left-0 z-50 w-52 rounded-lg border border-border bg-card shadow-lg py-1">
      {options.map((o) => {
        const until = new Date(Date.now() + o.hours * 60 * 60 * 1000).toISOString();
        return (
          <button
            key={o.label}
            onClick={() => {
              onSnooze(until);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export function EmailView({
  email,
  onClose,
  onStarToggle,
  onArchive,
  onDelete,
  onSnooze,
  onTaskCreated,
}: Props) {
  const [compose, setCompose] = useState<{ mode: ComposeMode } | null>(null);
  const [showSnooze, setShowSnooze] = useState(false);
  const [loadingAI, setLoadingAI] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState(email.aiSummary || "");
  const [aiSentiment, setAiSentiment] = useState(email.aiSentiment || "");
  const [aiCategory, setAiCategory] = useState(email.aiCategory || "");
  const [taskExtracted, setTaskExtracted] = useState<Record<string, string> | null>(null);
  const [taskCreating, setTaskCreating] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [showBody, setShowBody] = useState(true);

  const composeEmail: ComposeEmail = {
    id: email.id,
    subject: email.subject,
    from: email.from,
    to: email.to,
    cc: email.cc,
    body: email.body,
    htmlBody: email.htmlBody,
    messageId: email.messageId,
    references: email.references,
  };

  const runAI = useCallback(
    async (action: string) => {
      setLoadingAI(action);
      try {
        const res = await fetch("/api/email/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            email: {
              id: email.id,
              subject: email.subject,
              from: email.from,
              to: email.to,
              snippet: email.snippet || email.body.substring(0, 200),
              body: email.body,
            },
          }),
        });
        const data = await res.json();

        if (action === "summary" && data.summary) setAiSummary(data.summary);
        if (action === "sentiment" && data.sentiment) setAiSentiment(data.sentiment);
        if (action === "triage" && data.category) setAiCategory(data.category);
        if (action === "task" && data.task) setTaskExtracted(data.task);
      } catch {
        // silently fail
      } finally {
        setLoadingAI(null);
      }
    },
    [email]
  );

  const handleCreateTask = useCallback(async () => {
    if (!taskExtracted) return;
    setTaskCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskExtracted.title,
          notes: `${taskExtracted.notes || ""}\n\nFrom email: "${email.subject}" — ${email.from}`,
          priority: taskExtracted.priority || "medium",
          due_date: taskExtracted.due_date || null,
          assignee: taskExtracted.assignee || "Erik",
          status: "backlog",
          type: "internal",
        }),
      });
      if (res.ok) {
        setTaskCreated(true);
        onTaskCreated?.(taskExtracted);
      }
    } catch {
      // silently fail
    } finally {
      setTaskCreating(false);
    }
  }, [taskExtracted, email, onTaskCreated]);

  const handleSnooze = useCallback(
    async (until: string) => {
      try {
        await fetch("/api/email/snooze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailId: email.id,
            subject: email.subject,
            from: email.from,
            snippet: email.snippet,
            account: email.account,
            snoozedUntil: until,
          }),
        });
        onSnooze?.(email.id, until);
      } catch {
        // silently fail
      }
    },
    [email, onSnooze]
  );

  return (
    <>
      {/* Slide-in Panel */}
      <div className="fixed inset-0 z-30 flex justify-end pointer-events-none">
        <div
          className="fixed inset-0 pointer-events-auto"
          onClick={onClose}
        />
        <div className="relative w-full max-w-2xl h-full bg-card border-l border-border shadow-2xl overflow-y-auto pointer-events-auto flex flex-col">
          {/* Toolbar */}
          <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-border mx-1" />

            {/* Reply */}
            <button
              onClick={() => setCompose({ mode: "reply" })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm hover:bg-muted transition-colors"
              title="Reply (r)"
            >
              <Reply className="h-3.5 w-3.5" />
              Reply
            </button>
            <button
              onClick={() => setCompose({ mode: "replyAll" })}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
              title="Reply All"
            >
              <ReplyAll className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCompose({ mode: "forward" })}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
              title="Forward (f)"
            >
              <Forward className="h-3.5 w-3.5" />
            </button>

            <div className="h-4 w-px bg-border mx-1" />

            {/* Star */}
            <button
              onClick={() => onStarToggle?.(email.id, !email.starred)}
              className={cn(
                "p-1.5 rounded transition-colors",
                email.starred
                  ? "text-yellow-500 hover:text-yellow-600"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Star"
            >
              {email.starred ? (
                <Star className="h-3.5 w-3.5 fill-current" />
              ) : (
                <StarOff className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Archive */}
            {onArchive && (
              <button
                onClick={() => onArchive(email.id)}
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                title="Archive (e)"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Snooze */}
            <div className="relative">
              <button
                onClick={() => setShowSnooze(!showSnooze)}
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                title="Snooze"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
              {showSnooze && (
                <SnoozePicker
                  onSnooze={handleSnooze}
                  onClose={() => setShowSnooze(false)}
                />
              )}
            </div>

            {/* Delete */}
            {onDelete && (
              <button
                onClick={() => onDelete(email.id)}
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 px-6 py-5 space-y-4">
            {/* Subject */}
            <h2 className="text-xl font-semibold leading-tight">{email.subject}</h2>

            {/* AI Badges */}
            {(aiCategory || aiSentiment) && (
              <div className="flex items-center gap-2 flex-wrap">
                {aiCategory && <CategoryBadge category={aiCategory} />}
                {aiSentiment && <SentimentBadge sentiment={aiSentiment} />}
              </div>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div className="flex items-start gap-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/50 px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-orange-600 mt-0.5 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-300">{aiSummary}</p>
              </div>
            )}

            {/* Task Extracted */}
            {taskExtracted && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">
                      Task Extracted
                    </p>
                    <p className="text-sm font-medium">{taskExtracted.title}</p>
                    {taskExtracted.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{taskExtracted.notes}</p>
                    )}
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {taskExtracted.priority || "medium"} priority
                      </span>
                      {taskExtracted.due_date && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          Due: {taskExtracted.due_date}
                        </span>
                      )}
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {taskExtracted.assignee || "Erik"}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreateTask}
                    disabled={taskCreating || taskCreated}
                    className={cn(
                      "shrink-0 h-7 text-xs",
                      taskCreated
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                  >
                    {taskCreating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : taskCreated ? (
                      "Created!"
                    ) : (
                      <>
                        <CheckSquare className="h-3 w-3 mr-1" />
                        Add Task
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* AI Action Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => runAI("summary")}
                disabled={!!loadingAI}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-border hover:border-orange-400 hover:text-orange-600 transition-colors disabled:opacity-50"
              >
                {loadingAI === "summary" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Summarize
              </button>
              <button
                onClick={() => runAI("sentiment")}
                disabled={!!loadingAI}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-border hover:border-orange-400 hover:text-orange-600 transition-colors disabled:opacity-50"
              >
                {loadingAI === "sentiment" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Smile className="h-3 w-3" />
                )}
                Sentiment
              </button>
              <button
                onClick={() => runAI("triage")}
                disabled={!!loadingAI}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-border hover:border-orange-400 hover:text-orange-600 transition-colors disabled:opacity-50"
              >
                {loadingAI === "triage" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                Categorize
              </button>
              <button
                onClick={() => runAI("task")}
                disabled={!!loadingAI}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-border hover:border-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                {loadingAI === "task" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckSquare className="h-3 w-3" />
                )}
                Extract Task
              </button>
            </div>

            {/* Email Header */}
            <div className="space-y-1 rounded-lg bg-muted/30 border border-border/50 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-orange-600/10 flex items-center justify-center text-sm font-semibold text-orange-600 shrink-0">
                      {email.from.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{email.from}</p>
                      <p className="text-xs text-muted-foreground">
                        To: {email.to}
                        {email.cc && ` · Cc: ${email.cc}`}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground shrink-0">{formatDate(email.date)}</p>
              </div>

              {email.account && (
                <p className="text-xs text-muted-foreground mt-1">
                  Inbox:{" "}
                  <span className="font-medium">{email.account}</span>
                </p>
              )}
            </div>

            {/* Body */}
            <div>
              <button
                onClick={() => setShowBody(!showBody)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                {showBody ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Message body
              </button>

              {showBody && (
                <div className="rounded-lg border border-border/50 bg-card p-4">
                  {email.htmlBody ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: email.htmlBody }}
                    />
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                      {email.body}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Reply Bar */}
          <div className="sticky bottom-0 border-t border-border bg-card/95 px-4 py-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCompose({ mode: "reply" })}
              className="flex-1 gap-1.5"
            >
              <Reply className="h-3.5 w-3.5" />
              Reply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCompose({ mode: "forward" })}
              className="gap-1.5"
            >
              <Forward className="h-3.5 w-3.5" />
              Forward
            </Button>
          </div>
        </div>
      </div>

      {/* Compose Modal */}
      {compose && (
        <EmailCompose
          mode={compose.mode}
          replyTo={composeEmail}
          onClose={() => setCompose(null)}
          onSent={() => setCompose(null)}
        />
      )}
    </>
  );
}
