"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────

export type ComposeMode = "compose" | "reply" | "replyAll" | "forward" | "new";

export interface ComposeEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  body: string;
  htmlBody?: string;
  messageId?: string;
  references?: string[];
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  tags: string[];
}

interface Props {
  mode: ComposeMode;
  replyTo?: ComposeEmail;
  defaultTo?: string;
  onClose: () => void;
  onSent?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function buildSubject(mode: ComposeMode, original?: string): string {
  if (!original) return "";
  const stripped = original.replace(/^(Re|Fwd|FW|RE):\s*/i, "").trim();
  if (mode === "forward") return `Fwd: ${stripped}`;
  if (mode === "reply" || mode === "replyAll") return `Re: ${stripped}`;
  return "";
}

function buildQuote(email: ComposeEmail): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `\n\n---\nOn ${date}, ${email.from} wrote:\n\n${email.body
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}`;
}

// ── Template Picker ───────────────────────────────────────────────

function TemplatePicker({
  onSelect,
  onClose,
}: {
  onSelect: (template: EmailTemplate) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-lg border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Templates
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No templates yet</p>
        ) : (
          templates.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onSelect(t);
                onClose();
              }}
              className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <p className="text-sm font-medium">{t.name}</p>
              {t.tags.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.tags.join(", ")}
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Compose Component ────────────────────────────────────────

export function EmailCompose({ mode, replyTo, defaultTo, onClose, onSent }: Props) {
  const [to, setTo] = useState(
    mode === "reply"
      ? replyTo?.from || ""
      : mode === "replyAll"
      ? [replyTo?.from || "", replyTo?.cc || ""].filter(Boolean).join(", ")
      : mode === "forward"
      ? ""
      : defaultTo || ""
  );
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(
    mode === "compose" ? "" : buildSubject(mode, replyTo?.subject)
  );
  const [body, setBody] = useState(
    mode === "forward" && replyTo ? buildQuote(replyTo) : ""
  );
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Focus body on open (with small delay for animation)
  useEffect(() => {
    const timer = setTimeout(() => bodyRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard shortcut: Ctrl/Cmd+Enter to send
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const handleSend = useCallback(async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setError("To, subject, and body are required.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { to, subject, text: body };
      if (cc.trim()) payload.cc = cc;
      if (bcc.trim()) payload.bcc = bcc;
      if (replyTo?.messageId) {
        payload.inReplyTo = replyTo.messageId;
        payload.references = [
          ...(replyTo.references || []),
          replyTo.messageId,
        ];
      }

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      onSent?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  }, [to, subject, body, cc, bcc, replyTo, onSent, onClose]);

  const handleGetDraft = useCallback(async () => {
    if (!replyTo) return;
    setDraftLoading(true);
    try {
      const res = await fetch("/api/email/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          email: {
            id: replyTo.id,
            subject: replyTo.subject,
            from: replyTo.from,
            to: replyTo.to,
            snippet: replyTo.body.substring(0, 300),
            body: replyTo.body,
          },
        }),
      });
      const data = await res.json();
      if (data.draft) {
        setBody(data.draft + (mode !== "compose" ? buildQuote(replyTo) : ""));
      }
    } catch {
      // silently fail
    } finally {
      setDraftLoading(false);
    }
  }, [replyTo, mode]);

  const applyTemplate = useCallback((template: EmailTemplate) => {
    if (template.subject) setSubject(template.subject);
    setBody(template.body);
    // Increment use count
    fetch("/api/email/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: template.id, action: "use" }),
    }).catch(() => {});
  }, []);

  const modeLabel =
    mode === "compose"
      ? "New Message"
      : mode === "reply"
      ? "Reply"
      : mode === "replyAll"
      ? "Reply All"
      : "Forward";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Compose Window */}
      <div
        className={cn(
          "fixed z-50 bg-card border border-border rounded-xl shadow-2xl flex flex-col transition-all duration-200",
          expanded
            ? "inset-4 md:inset-8"
            : "bottom-4 right-4 w-full max-w-lg md:right-6 md:bottom-6"
        )}
        style={expanded ? {} : { maxHeight: "560px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border rounded-t-xl bg-muted/30">
          <span className="text-sm font-semibold">{modeLabel}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="border-b border-border">
          {/* To */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
            <span className="text-xs text-muted-foreground w-12 shrink-0">To</span>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="border-0 shadow-none focus-visible:ring-0 h-7 px-0 text-sm"
            />
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => setShowCc(!showCc)}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded transition-colors",
                  showCc
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Cc
              </button>
              <button
                onClick={() => setShowBcc(!showBcc)}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded transition-colors",
                  showBcc
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Bcc
              </button>
            </div>
          </div>

          {/* CC */}
          {showCc && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground w-12 shrink-0">Cc</span>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@example.com"
                className="border-0 shadow-none focus-visible:ring-0 h-7 px-0 text-sm"
              />
            </div>
          )}

          {/* BCC */}
          {showBcc && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
              <span className="text-xs text-muted-foreground w-12 shrink-0">Bcc</span>
              <Input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="bcc@example.com"
                className="border-0 shadow-none focus-visible:ring-0 h-7 px-0 text-sm"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="text-xs text-muted-foreground w-12 shrink-0">Subject</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="border-0 shadow-none focus-visible:ring-0 h-7 px-0 text-sm"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            className="w-full h-full resize-none bg-transparent px-4 py-3 text-sm focus:outline-none leading-relaxed"
            style={{ minHeight: expanded ? "200px" : "140px" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border rounded-b-xl">
          <div className="flex items-center gap-2 relative">
            {/* Templates */}
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted"
              >
                <FileText className="h-3.5 w-3.5" />
                Templates
                {showTemplates ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </button>
              {showTemplates && (
                <TemplatePicker
                  onSelect={applyTemplate}
                  onClose={() => setShowTemplates(false)}
                />
              )}
            </div>

            {/* AI Draft (only in reply modes) */}
            {replyTo && (
              <button
                onClick={handleGetDraft}
                disabled={draftLoading}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-orange-600 transition-colors px-2 py-1.5 rounded hover:bg-orange-50 dark:hover:bg-orange-950/20"
                title="Generate AI draft response"
              >
                {draftLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI Draft
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">
              ⌘↵ to send
            </span>
            <Button
              onClick={handleSend}
              disabled={sending}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
