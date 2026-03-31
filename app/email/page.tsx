"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail,
  Inbox,
  Archive,
  Trash2,
  Star,
  RefreshCw,
  Search,
  Check,
  Circle,
  Clock,
  BookOpen,
  FileText,
  Reply,
  Forward,
  Plus,
  Brain,
  Sparkles,
  Ban,
  FolderOpen,
  ChevronDown,
  Command,
  ListChecks,
  TrendingUp,
  ShieldOff,
  Bell,
} from "lucide-react";
import { EmailSettingsSheet } from "@/components/email-settings";
import { EmailCompose } from "@/components/email-compose";
import { EmailRow } from "@/components/email-row";
import { EmailAI } from "@/components/email-ai";
import { CommandPalette, type CommandAction } from "@/components/command-palette";
import { EmailAnalytics } from "@/components/email-analytics";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  read: boolean;
  starred: boolean;
  account: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

type ViewTab = "digest" | "all" | "analytics";

// ── Helper: update cache ──────────────────────────────────────────
function updateCache(emails: Email[]) {
  sessionStorage.setItem(
    "emails-cache",
    JSON.stringify({ emails, timestamp: Date.now() })
  );
}

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ViewTab>("digest");
  const [composing, setComposing] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "forward">("new");
  const [replyToEmail, setReplyToEmail] = useState<Email | null>(null);
  const [categorizationRules, setCategorizationRules] = useState<any>({
    topOfMind: [],
    fyi: [],
    newsletter: [],
    spam: [],
  });
  const [brains, setBrains] = useState<any[]>([]);
  const [showAI, setShowAI] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [showBrainSelector, setShowBrainSelector] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [customFolder, setCustomFolder] = useState("");
  const [movingToFolder, setMovingToFolder] = useState(false);
  const [aiSummary, setAiSummary] = useState<{
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    sentiment: string;
  } | null>(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<string[]>([]);
  const [extractingTasks, setExtractingTasks] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [followUpsDue, setFollowUpsDue] = useState<any[]>([]);

  // Track focused email index for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Load data ───────────────────────────────────────────────────
  useEffect(() => {
    loadCategorizationRules();
    loadBrains();
    loadFollowUps();

    const cached = sessionStorage.getItem("emails-cache");
    if (cached) {
      try {
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - data.timestamp;
        const oneHour = 60 * 60 * 1000;

        setEmails(data.emails);
        setLoading(false);

        const now = new Date();
        const estHour = new Date(
          now.toLocaleString("en-US", { timeZone: "America/New_York" })
        ).getHours();
        const isQuietHours = estHour < 5 || estHour >= 21;

        if (isQuietHours || cacheAge < oneHour) return;
      } catch {
        // Invalid cache
      }
    }
    loadEmails();
  }, []);

  // ── Keyboard shortcuts (global) ─────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }

      // If email detail modal is open
      if (selectedEmail) {
        switch (e.key) {
          case "Escape":
            e.preventDefault();
            setSelectedEmail(null);
            break;
          case "e":
            e.preventDefault();
            handleArchiveEmail(selectedEmail.id);
            toast.success("Email archived");
            setSelectedEmail(null);
            break;
          case "#":
            e.preventDefault();
            handleDeleteEmail(selectedEmail.id);
            toast.success("Email deleted");
            setSelectedEmail(null);
            break;
          case "s":
            e.preventDefault();
            toggleStar(selectedEmail);
            break;
          case "u":
            e.preventDefault();
            toggleRead(selectedEmail);
            break;
          case "r":
            e.preventDefault();
            openReply(selectedEmail);
            break;
          case "f":
            e.preventDefault();
            openForward(selectedEmail);
            break;
        }
        return;
      }

      // Inbox navigation
      const currentList = getFilteredEmails();
      switch (e.key) {
        case "j":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, currentList.length - 1));
          break;
        case "k":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          if (focusedIndex >= 0 && focusedIndex < currentList.length) {
            e.preventDefault();
            handleOpenEmail(currentList[focusedIndex]);
          }
          break;
        case "x":
          if (focusedIndex >= 0 && focusedIndex < currentList.length) {
            e.preventDefault();
            toggleSelect(currentList[focusedIndex].id);
          }
          break;
        case "e":
          if (selected.size > 0) {
            e.preventDefault();
            archiveSelected();
          }
          break;
        case "#":
          if (selected.size > 0) {
            e.preventDefault();
            deleteSelected();
          }
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "c":
          e.preventDefault();
          setComposeMode("new");
          setReplyToEmail(null);
          setComposing(true);
          break;
        case "?":
          e.preventDefault();
          toast.info(
            "Keyboard shortcuts: j/k=navigate, Enter=open, e=archive, #=delete, s=star, u=read/unread, r=reply, f=forward, x=select, c=compose, /=search, Cmd+K=commands"
          );
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEmail, focusedIndex, selected, emails, search]);

  // ── Data loaders ────────────────────────────────────────────────
  async function loadCategorizationRules() {
    try {
      const res = await fetch("/api/email/categorize");
      const data = await res.json();
      setCategorizationRules(data.categorization);
    } catch {
      console.error("Failed to load categorization rules");
    }
  }

  async function loadBrains() {
    try {
      const res = await fetch("/api/brain");
      const data = await res.json();
      setBrains(data.brains || []);
    } catch {
      console.error("Failed to load brains");
    }
  }

  async function loadFollowUps() {
    try {
      const res = await fetch("/api/email/follow-ups");
      if (res.ok) {
        const data = await res.json();
        setFollowUpsDue(data.due || []);
      }
    } catch {
      // silent
    }
  }

  async function dismissFollowUp(emailId: string) {
    try {
      await fetch("/api/email/follow-ups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, action: "dismiss" }),
      });
      setFollowUpsDue((prev) => prev.filter((f) => f.emailId !== emailId));
      toast.success("Follow-up dismissed");
    } catch {
      toast.error("Failed to dismiss follow-up");
    }
  }

  async function blockSender(sender: string) {
    try {
      await fetch("/api/email/block-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender }),
      });
      toast.success(`Blocked ${sender.split("<")[0].trim()}`, {
        description: "Future emails will be automatically filtered to spam",
      });
    } catch {
      toast.error("Failed to block sender");
    }
  }

  async function loadEmails(forceRefresh = false) {
    if (emails.length === 0) setLoading(true);

    try {
      const url = forceRefresh
        ? "/api/email-fetch?refresh=true"
        : "/api/email-fetch";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.error) {
        toast.error("Failed to load emails", { description: data.error });
        return;
      }

      const fetched = data.emails || [];
      setEmails(fetched);
      updateCache(fetched);

      if (forceRefresh) {
        toast.success(`Loaded ${fetched.length} emails`);
      }
    } catch (err: any) {
      toast.error("Error loading emails", { description: err.message });
    } finally {
      setLoading(false);
    }
  }

  // ── Email actions ───────────────────────────────────────────────
  function handleOpenEmail(email: Email) {
    setAiSummary(null);
    setExtractedTasks([]);
    setShowSnooze(false);
    setShowFolderPicker(false);
    setShowBrainSelector(false);

    if (!email.read) {
      const updated = emails.map((e) =>
        e.id === email.id ? { ...e, read: true } : e
      );
      setEmails(updated);
      updateCache(updated);

      fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: [email.id], action: "mark-read" }),
      }).catch(() => {});
    }

    setSelectedEmail(email);
  }

  async function handleDeleteEmail(id: string) {
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: [id], action: "delete" }),
      });
      const newEmails = emails.filter((e) => e.id !== id);
      setEmails(newEmails);
      updateCache(newEmails);
    } catch {
      toast.error("Failed to delete email");
    }
  }

  async function handleArchiveEmail(id: string) {
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: [id], action: "archive" }),
      });
      const newEmails = emails.filter((e) => e.id !== id);
      setEmails(newEmails);
      updateCache(newEmails);
    } catch {
      toast.error("Failed to archive email");
    }
  }

  async function toggleStar(email: Email) {
    const newStarred = !email.starred;
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailIds: [email.id],
          action: newStarred ? "star" : "unstar",
        }),
      });
      const updated = emails.map((e) =>
        e.id === email.id ? { ...e, starred: newStarred } : e
      );
      setEmails(updated);
      updateCache(updated);
      if (selectedEmail?.id === email.id) {
        setSelectedEmail({ ...selectedEmail, starred: newStarred });
      }
      toast.success(newStarred ? "Starred" : "Unstarred");
    } catch {
      toast.error("Failed to update star");
    }
  }

  async function toggleRead(email: Email) {
    const action = email.read ? "mark-unread" : "mark-read";
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: [email.id], action }),
      });
      const updated = emails.map((e) =>
        e.id === email.id ? { ...e, read: !e.read } : e
      );
      setEmails(updated);
      updateCache(updated);
      if (selectedEmail?.id === email.id) {
        setSelectedEmail({ ...selectedEmail, read: !selectedEmail.read });
      }
      toast.success(email.read ? "Marked unread" : "Marked read");
    } catch {
      toast.error("Failed to update read status");
    }
  }

  function openReply(email: Email) {
    setReplyToEmail(email);
    setComposeMode("reply");
    setComposing(true);
    setSelectedEmail(null);
  }

  function openForward(email: Email) {
    setReplyToEmail(email);
    setComposeMode("forward");
    setComposing(true);
    setSelectedEmail(null);
  }

  // ── Bulk actions ────────────────────────────────────────────────
  function toggleSelect(id: string) {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelected(newSelected);
  }

  function selectAllInSection(sectionEmails: Email[]) {
    const newSelected = new Set(selected);
    const allSelected =
      sectionEmails.length > 0 &&
      sectionEmails.every((e) => newSelected.has(e.id));
    if (allSelected) {
      sectionEmails.forEach((e) => newSelected.delete(e.id));
    } else {
      sectionEmails.forEach((e) => newSelected.add(e.id));
    }
    setSelected(newSelected);
  }

  async function archiveSelected() {
    const ids = Array.from(selected);
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: ids, action: "archive" }),
      });
      const newEmails = emails.filter((e) => !selected.has(e.id));
      setEmails(newEmails);
      setSelected(new Set());
      updateCache(newEmails);
      toast.success(`Archived ${ids.length} email${ids.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to archive emails");
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: ids, action: "delete" }),
      });
      const newEmails = emails.filter((e) => !selected.has(e.id));
      setEmails(newEmails);
      setSelected(new Set());
      updateCache(newEmails);
      toast.success(`Deleted ${ids.length} email${ids.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to delete emails");
    }
  }

  async function markAsRead() {
    const ids = Array.from(selected);
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: ids, action: "mark-read" }),
      });
      setEmails(emails.map((e) => (selected.has(e.id) ? { ...e, read: true } : e)));
      setSelected(new Set());
      toast.success(`Marked ${ids.length} email${ids.length > 1 ? "s" : ""} as read`);
    } catch {
      toast.error("Failed to mark as read");
    }
  }

  // ── Categorize ──────────────────────────────────────────────────
  async function handleCategorize(sender: string, category: string) {
    const categoryNames: Record<string, string> = {
      topOfMind: "Top of Mind",
      fyi: "FYI",
      newsletter: "Newsletter",
      spam: "Spam",
    };
    try {
      await fetch("/api/email/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, category }),
      });
      toast.success(`Categorized as ${categoryNames[category]}`, {
        description: `Future emails from ${sender.split("<")[0].trim()} will be automatically categorized`,
      });
      sessionStorage.removeItem("emails-cache");
    } catch {
      toast.error("Failed to categorize");
    }
  }

  // ── Unsubscribe ─────────────────────────────────────────────────
  async function handleUnsubscribe(email: Email) {
    setUnsubscribing(true);
    try {
      const res = await fetch("/api/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailBody: email.body,
          emailHtml: email.htmlBody,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(
          data.automated ? "Automated Unsubscribe" : "Manual Unsubscribe",
          { description: data.message }
        );
        if (data.manualAction && data.url) {
          window.open(data.url, "_blank");
        }
        if (data.automated && !data.needsVerification) {
          setTimeout(async () => {
            await handleArchiveEmail(email.id);
            setSelectedEmail(null);
          }, 2000);
        }
      } else {
        toast.error(data.message || "Could not find unsubscribe link");
      }
    } catch {
      toast.error("Failed to process unsubscribe request");
    } finally {
      setUnsubscribing(false);
    }
  }

  // ── Snooze ──────────────────────────────────────────────────────
  function snoozeEmail(email: Email, hours: number, label: string) {
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    const snoozed = JSON.parse(localStorage.getItem("snoozed-emails") || "{}");
    snoozed[email.id] = until;
    localStorage.setItem("snoozed-emails", JSON.stringify(snoozed));

    const newEmails = emails.filter((e) => e.id !== email.id);
    setEmails(newEmails);
    updateCache(newEmails);
    setSelectedEmail(null);
    setShowSnooze(false);
    toast.success(`Snoozed until ${label}`);
  }

  // ── AI Summary ──────────────────────────────────────────────────
  async function summarizeEmail(email: Email) {
    setAiSummarizing(true);
    try {
      const res = await fetch("/api/email/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: email.subject,
          from: email.from,
          body: email.body,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data);
      } else {
        toast.error("Failed to summarize email");
      }
    } catch {
      toast.error("Failed to summarize email");
    } finally {
      setAiSummarizing(false);
    }
  }

  // ── AI Extract Tasks ────────────────────────────────────────────
  async function extractTasks(email: Email) {
    setExtractingTasks(true);
    try {
      const res = await fetch("/api/email/extract-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: email.subject,
          from: email.from,
          body: email.body,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExtractedTasks(data.tasks || []);
        if (data.tasks?.length === 0) {
          toast.info("No actionable tasks found in this email");
        }
      }
    } catch {
      toast.error("Failed to extract tasks");
    } finally {
      setExtractingTasks(false);
    }
  }

  // ── Brain ───────────────────────────────────────────────────────
  async function addToBrain(brainId: string) {
    if (!selectedEmail) return;
    try {
      await fetch(`/api/brain/${brainId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", sender: selectedEmail.from }),
      });
      setShowBrainSelector(false);
      await loadBrains();
      toast.success(`Added ${selectedEmail.from} to brain`);
    } catch {
      toast.error("Failed to add to brain");
    }
  }

  // ── Move to folder ──────────────────────────────────────────────
  async function moveToFolder(emailId: string, folder: string) {
    setMovingToFolder(true);
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: [emailId], action: "move", folder }),
      });
      const newEmails = emails.filter((e) => e.id !== emailId);
      setEmails(newEmails);
      updateCache(newEmails);
      setSelectedEmail(null);
      setShowFolderPicker(false);
      toast.success(`Moved to ${folder}`);
    } catch {
      toast.error("Failed to move email");
    } finally {
      setMovingToFolder(false);
    }
  }

  // ── Filtering & categorization ──────────────────────────────────
  const filtered = emails.filter(
    (e) =>
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.from.toLowerCase().includes(search.toLowerCase())
  );

  function getFilteredEmails() {
    return filtered;
  }

  const matchesSender = (email: Email, senders: string[]) =>
    senders.some((s) => email.from.includes(s));

  const spamEmails = filtered.filter(
    (e) =>
      matchesSender(e, categorizationRules.spam || []) ||
      e.subject.toLowerCase().includes("spam") ||
      e.from.includes("spam@")
  );
  const spamIds = new Set(spamEmails.map((e) => e.id));

  const categorized = {
    topOfMind: filtered.filter(
      (e) =>
        matchesSender(e, categorizationRules.topOfMind || []) ||
        e.subject.toLowerCase().includes("urgent") ||
        e.subject.toLowerCase().includes("action required")
    ),
    fyi: filtered.filter((e) => {
      if (matchesSender(e, categorizationRules.topOfMind || [])) return false;
      if (matchesSender(e, categorizationRules.newsletter || [])) return false;
      if (matchesSender(e, categorizationRules.spam || [])) return false;
      if (matchesSender(e, categorizationRules.fyi || [])) return true;
      return (
        !e.subject.toLowerCase().includes("urgent") &&
        !e.subject.toLowerCase().includes("newsletter") &&
        !e.from.includes("newsletter@") &&
        !e.from.includes("noreply@")
      );
    }),
    newsletters: filtered.filter((e) => {
      if (spamIds.has(e.id)) return false;
      return (
        matchesSender(e, categorizationRules.newsletter || []) ||
        e.subject.toLowerCase().includes("newsletter") ||
        e.from.includes("newsletter@") ||
        e.from.includes("noreply@")
      );
    }),
    spam: spamEmails,
  };

  // ── Command palette actions ─────────────────────────────────────
  const commandActions: CommandAction[] = [
    {
      id: "archive",
      label: "Archive selected",
      icon: <Archive className="h-4 w-4" />,
      shortcut: "e",
      action: () => {
        if (selectedEmail) {
          handleArchiveEmail(selectedEmail.id);
          setSelectedEmail(null);
        } else if (selected.size > 0) {
          archiveSelected();
        }
      },
      category: "email",
    },
    {
      id: "delete",
      label: "Delete selected",
      icon: <Trash2 className="h-4 w-4" />,
      shortcut: "#",
      action: () => {
        if (selectedEmail) {
          handleDeleteEmail(selectedEmail.id);
          setSelectedEmail(null);
        } else if (selected.size > 0) {
          deleteSelected();
        }
      },
      category: "email",
    },
    {
      id: "reply",
      label: "Reply to email",
      icon: <Reply className="h-4 w-4" />,
      shortcut: "r",
      action: () => selectedEmail && openReply(selectedEmail),
      category: "email",
    },
    {
      id: "forward",
      label: "Forward email",
      icon: <Forward className="h-4 w-4" />,
      shortcut: "f",
      action: () => selectedEmail && openForward(selectedEmail),
      category: "email",
    },
    {
      id: "star",
      label: "Toggle star",
      icon: <Star className="h-4 w-4" />,
      shortcut: "s",
      action: () => selectedEmail && toggleStar(selectedEmail),
      category: "email",
    },
    {
      id: "snooze",
      label: "Snooze email",
      icon: <Clock className="h-4 w-4" />,
      action: () => setShowSnooze(true),
      category: "email",
    },
    {
      id: "unsubscribe",
      label: "Unsubscribe from sender",
      icon: <Ban className="h-4 w-4" />,
      action: () => selectedEmail && handleUnsubscribe(selectedEmail),
      category: "email",
    },
    {
      id: "compose",
      label: "Compose new email",
      icon: <Plus className="h-4 w-4" />,
      shortcut: "c",
      action: () => {
        setComposeMode("new");
        setReplyToEmail(null);
        setComposing(true);
      },
      category: "email",
    },
    {
      id: "refresh",
      label: "Refresh inbox",
      icon: <RefreshCw className="h-4 w-4" />,
      action: () => loadEmails(true),
      category: "general",
    },
    {
      id: "ai-summary",
      label: "AI Summarize email",
      icon: <Sparkles className="h-4 w-4" />,
      action: () => selectedEmail && summarizeEmail(selectedEmail),
      category: "ai",
    },
    {
      id: "ai-tasks",
      label: "AI Extract tasks",
      icon: <ListChecks className="h-4 w-4" />,
      action: () => selectedEmail && extractTasks(selectedEmail),
      category: "ai",
    },
    {
      id: "ai-assistant",
      label: "Open AI assistant",
      icon: <Sparkles className="h-4 w-4" />,
      action: () => setShowAI(true),
      category: "ai",
    },
    {
      id: "search",
      label: "Search emails",
      icon: <Search className="h-4 w-4" />,
      shortcut: "/",
      action: () => searchRef.current?.focus(),
      category: "general",
    },
  ];

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        actions={commandActions}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Email
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {emails.length} emails loaded
            <span className="ml-2 text-xs">
              Press{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px]">
                ?
              </kbd>{" "}
              for shortcuts
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCommandPaletteOpen(true)}
            className="gap-2"
          >
            <Command className="h-4 w-4" />
            <kbd className="text-[10px] text-muted-foreground">K</kbd>
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setComposeMode("new");
              setReplyToEmail(null);
              setComposing(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Compose
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadEmails(true)}
            disabled={loading}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", loading && "animate-spin")}
            />
            Refresh
          </Button>
          <EmailSettingsSheet />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchRef}
          placeholder="Search emails... ( / to focus)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              (e.target as HTMLElement).blur();
            }
          }}
        />
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={markAsRead}>
            <Check className="h-4 w-4 mr-2" />
            Mark Read
          </Button>
          <Button size="sm" variant="ghost" onClick={archiveSelected}>
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={deleteSelected}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            <span className="text-xs">Clear</span>
          </Button>
        </div>
      )}

      {/* Follow-up Reminders Banner */}
      {followUpsDue.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">
                {followUpsDue.length} follow-up{followUpsDue.length > 1 ? "s" : ""} due
              </span>
            </div>
            <div className="space-y-2">
              {followUpsDue.slice(0, 3).map((f: any) => (
                <div
                  key={f.emailId}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{f.subject}</span>
                    <span className="text-muted-foreground ml-2">to {f.to}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => dismissFollowUp(f.emailId)}
                  >
                    Dismiss
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ViewTab)}
      >
        <TabsList>
          <TabsTrigger value="digest">
            <BookOpen className="h-4 w-4 mr-2" />
            Digest
          </TabsTrigger>
          <TabsTrigger value="all">
            <FileText className="h-4 w-4 mr-2" />
            All Emails
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <TrendingUp className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Digest View */}
        <TabsContent value="digest" className="space-y-6 mt-6">
          {/* Top of Mind */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-orange-500" />
                Top of Mind
                <Badge variant="secondary">
                  {categorized.topOfMind.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categorized.topOfMind.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No urgent emails
                </p>
              )}
              {categorized.topOfMind.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selected.has(email.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={handleOpenEmail}
                  onDelete={handleDeleteEmail}
                  onArchive={handleArchiveEmail}
                />
              ))}
            </CardContent>
          </Card>

          {/* FYI */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4 text-blue-500" />
                FYI
                <Badge variant="secondary">{categorized.fyi.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {categorized.fyi.length === 0 && (
                <p className="text-sm text-muted-foreground">No FYI emails</p>
              )}
              {categorized.fyi.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selected.has(email.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={handleOpenEmail}
                  onDelete={handleDeleteEmail}
                  onArchive={handleArchiveEmail}
                />
              ))}
            </CardContent>
          </Card>

          {/* Newsletters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                Newsletters
                <Badge variant="secondary">
                  {categorized.newsletters.length}
                </Badge>
                {categorized.newsletters.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 text-xs"
                    onClick={() => selectAllInSection(categorized.newsletters)}
                  >
                    {categorized.newsletters.every((e) => selected.has(e.id))
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {categorized.newsletters.length === 0 && (
                <p className="text-sm text-muted-foreground">No newsletters</p>
              )}
              {categorized.newsletters.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selected.has(email.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={handleOpenEmail}
                  onDelete={handleDeleteEmail}
                  onArchive={handleArchiveEmail}
                />
              ))}
            </CardContent>
          </Card>

          {/* Spam */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                Spam
                <Badge variant="secondary">{categorized.spam.length}</Badge>
                {categorized.spam.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 text-xs"
                    onClick={() => selectAllInSection(categorized.spam)}
                  >
                    {categorized.spam.every((e) => selected.has(e.id))
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {categorized.spam.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No spam emails
                </p>
              )}
              {categorized.spam.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selected.has(email.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={handleOpenEmail}
                  onDelete={handleDeleteEmail}
                  onArchive={handleArchiveEmail}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Emails View */}
        <TabsContent value="all" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {filtered.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    {loading ? "Loading emails..." : "No emails found"}
                  </div>
                )}
                {filtered.map((email, idx) => (
                  <div
                    key={email.id}
                    className={cn(
                      "flex items-start gap-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                      focusedIndex === idx && !selectedEmail && "bg-muted/50 ring-1 ring-primary/20"
                    )}
                    onClick={() => handleOpenEmail(email)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(email.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(email.id);
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p
                          className={cn(
                            "font-medium text-sm truncate",
                            !email.read && "font-bold"
                          )}
                        >
                          {email.subject}
                        </p>
                        {!email.read && (
                          <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {email.from}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {email.snippet}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(email.date).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics View */}
        <TabsContent value="analytics" className="mt-6">
          <EmailAnalytics />
        </TabsContent>
      </Tabs>

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedEmail(null)}
        >
          <div
            className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b sticky top-0 bg-background">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {selectedEmail.subject}
                </h2>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={
                      selectedEmail.starred
                        ? "text-yellow-500"
                        : "text-muted-foreground"
                    }
                    onClick={() => toggleStar(selectedEmail)}
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        selectedEmail.starred && "fill-yellow-500"
                      )}
                    />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedEmail(null)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
              <div className="space-y-1 text-sm mb-4">
                <p className="text-foreground">
                  <strong>From:</strong>{" "}
                  <span className="text-foreground">{selectedEmail.from}</span>
                </p>
                <p className="text-muted-foreground">
                  <strong>To:</strong> {selectedEmail.to}
                </p>
                <p className="text-muted-foreground">
                  <strong>Date:</strong>{" "}
                  {new Date(selectedEmail.date).toLocaleString()}
                </p>
                {selectedEmail.attachments &&
                  selectedEmail.attachments.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-foreground font-medium mb-2">
                        Attachments ({selectedEmail.attachments.length})
                      </p>
                      <div className="space-y-1">
                        {selectedEmail.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground flex-1">
                              {att.filename}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {(att.size / 1024).toFixed(1)} KB
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {/* Quick Categorize */}
              <div className="flex gap-2 mb-3 p-2 bg-muted/30 rounded-lg">
                <span className="text-xs font-medium text-muted-foreground self-center mr-2">
                  Categorize:
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={async () => {
                    await handleCategorize(selectedEmail.from, "topOfMind");
                    await loadEmails(true);
                  }}
                >
                  <Star className="h-3 w-3 mr-1" />
                  Top of Mind
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={async () => {
                    await handleCategorize(selectedEmail.from, "fyi");
                    await loadEmails(true);
                  }}
                >
                  <Inbox className="h-3 w-3 mr-1" />
                  FYI
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={async () => {
                    await handleCategorize(selectedEmail.from, "newsletter");
                    await loadEmails(true);
                  }}
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Newsletter
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-destructive"
                  onClick={async () => {
                    await handleCategorize(selectedEmail.from, "spam");
                    await handleDeleteEmail(selectedEmail.id);
                    setSelectedEmail(null);
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Spam
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 dark:text-purple-300 border-purple-600/30"
                  onClick={() => setShowBrainSelector(!showBrainSelector)}
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Add to Brain
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aiSummarizing}
                  className="text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                  onClick={() => summarizeEmail(selectedEmail)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {aiSummarizing ? "Summarizing..." : "AI Summary"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={extractingTasks}
                  className="text-green-600 border-green-600/30 hover:bg-green-600/10"
                  onClick={() => extractTasks(selectedEmail)}
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  {extractingTasks ? "Extracting..." : "Extract Tasks"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-orange-500 border-orange-500/30 hover:bg-orange-500/10"
                  onClick={() => setShowSnooze(!showSnooze)}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Snooze
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openReply(selectedEmail)}
                >
                  <Reply className="h-4 w-4 mr-2" />
                  Reply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openForward(selectedEmail)}
                >
                  <Forward className="h-4 w-4 mr-2" />
                  Forward
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleArchiveEmail(selectedEmail.id);
                    toast.success("Archived");
                    setSelectedEmail(null);
                  }}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unsubscribing}
                  onClick={() => handleUnsubscribe(selectedEmail)}
                  className="text-orange-600 hover:text-orange-700"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  {unsubscribing ? "Unsubscribing..." : "Unsubscribe"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    blockSender(selectedEmail.from);
                    handleDeleteEmail(selectedEmail.id);
                    setSelectedEmail(null);
                  }}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Block Sender
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleDeleteEmail(selectedEmail.id);
                    toast.success("Deleted");
                    setSelectedEmail(null);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleRead(selectedEmail)}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Mark {selectedEmail.read ? "Unread" : "Read"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowFolderPicker(!showFolderPicker);
                    setCustomFolder("");
                  }}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Move to Folder
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 ml-1 transition-transform",
                      showFolderPicker && "rotate-180"
                    )}
                  />
                </Button>
              </div>

              {/* Move to Folder Picker */}
              {showFolderPicker && (
                <div className="mt-2 p-3 bg-muted/40 border border-border rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Select folder:
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {[
                      "Clients",
                      "Amazon",
                      "eBay",
                      "Orders",
                      "Follow-up",
                      "Receipts",
                      "Marketing",
                      "Personal",
                    ].map((folder) => (
                      <Button
                        key={folder}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={movingToFolder}
                        onClick={() => moveToFolder(selectedEmail.id, folder)}
                      >
                        {folder}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="h-7 text-xs"
                      placeholder="Custom folder name..."
                      value={customFolder}
                      onChange={(e) => setCustomFolder(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customFolder.trim()) {
                          moveToFolder(selectedEmail.id, customFolder.trim());
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!customFolder.trim() || movingToFolder}
                      onClick={() =>
                        moveToFolder(selectedEmail.id, customFolder.trim())
                      }
                    >
                      {movingToFolder ? "Moving..." : "Move"}
                    </Button>
                  </div>
                </div>
              )}

              {/* AI Summary Panel */}
              {aiSummary && (
                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> AI Summary
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {aiSummary.sentiment}
                    </Badge>
                  </p>
                  <p className="text-sm text-foreground mb-2">
                    {aiSummary.summary}
                  </p>
                  {aiSummary.keyPoints.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-blue-400 mb-1">
                        Key Points:
                      </p>
                      <ul className="space-y-0.5">
                        {aiSummary.keyPoints.map((point, i) => (
                          <li
                            key={i}
                            className="text-xs text-foreground flex gap-1.5"
                          >
                            <span className="text-blue-400 shrink-0">
                              -
                            </span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiSummary.actionItems.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-blue-400 mb-1">
                        Action Items:
                      </p>
                      <ul className="space-y-0.5">
                        {aiSummary.actionItems.map((item, i) => (
                          <li
                            key={i}
                            className="text-xs text-foreground flex gap-1.5"
                          >
                            <span className="text-green-500 shrink-0">
                              -
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Snooze Picker */}
              {showSnooze && (
                <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <p className="text-xs font-semibold text-orange-400 mb-2">
                    Snooze until:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Later today", display: "3 hours", hours: 3 },
                      { label: "Tomorrow 8am", display: "Tomorrow 8am", hours: 20 },
                      { label: "This weekend", display: "Saturday", hours: 48 },
                      { label: "Next week", display: "Next Monday", hours: 168 },
                    ].map(({ label, display, hours }) => (
                      <Button
                        key={label}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-orange-500/30 hover:bg-orange-500/10"
                        onClick={() =>
                          snoozeEmail(selectedEmail, hours, display)
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Tasks */}
              {extractedTasks.length > 0 && (
                <div className="mt-3 p-3 bg-green-600/10 border border-green-600/30 rounded-lg">
                  <p className="text-xs font-semibold text-green-500 mb-2 flex items-center gap-1">
                    <ListChecks className="h-3 w-3" /> Extracted Tasks
                  </p>
                  <ul className="space-y-1">
                    {extractedTasks.map((task, i) => (
                      <li
                        key={i}
                        className="text-sm text-foreground flex items-start gap-2"
                      >
                        <span className="text-green-500 mt-0.5">-</span>
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Brain Selector Dropdown */}
              {showBrainSelector && (
                <div className="mt-3">
                  <div className="bg-purple-600/10 dark:bg-purple-600/20 border border-purple-600/30 rounded-lg p-4">
                    <p className="text-sm font-medium mb-3 text-foreground">
                      Add sender to Brain sources:
                    </p>
                    {brains.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No Brains yet.{" "}
                        <a
                          href="/brain"
                          className="text-purple-400 hover:text-purple-300 underline"
                        >
                          Create one first
                        </a>
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {brains.map((brain) => {
                          const alreadyAdded =
                            brain.email_sources?.includes(
                              selectedEmail?.from || ""
                            );
                          return (
                            <Button
                              key={brain.id}
                              size="sm"
                              variant={alreadyAdded ? "default" : "outline"}
                              className={
                                alreadyAdded
                                  ? "justify-start bg-purple-600 hover:bg-purple-700 text-white"
                                  : "justify-start bg-background hover:bg-muted text-foreground border-border"
                              }
                              onClick={() => addToBrain(brain.id)}
                            >
                              <span className="mr-2">{brain.icon}</span>
                              {brain.name}
                              {alreadyAdded && (
                                <span className="ml-auto text-xs">
                                  ✓
                                </span>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6">
              {selectedEmail.htmlBody ? (
                <div
                  className="email-content"
                  dangerouslySetInnerHTML={{
                    __html: selectedEmail.htmlBody,
                  }}
                  style={{
                    maxWidth: "100%",
                    overflowX: "auto",
                  }}
                />
              ) : (
                <div className="whitespace-pre-wrap">
                  {selectedEmail.body}
                </div>
              )}
            </div>
            <style jsx>{`
              .email-content {
                font-size: 14px;
                line-height: 1.6;
              }
              .email-content img {
                max-width: 100%;
                height: auto;
              }
              .email-content a {
                color: #3b82f6;
                text-decoration: underline;
              }
              .email-content table {
                border-collapse: collapse;
                width: 100%;
              }
              .email-content td,
              .email-content th {
                padding: 8px;
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {composing && (
        <EmailCompose
          mode={composeMode}
          replyTo={
            replyToEmail
              ? {
                  id: replyToEmail.id,
                  subject: replyToEmail.subject,
                  from: replyToEmail.from,
                  to: replyToEmail.to,
                  body: replyToEmail.body,
                  htmlBody: replyToEmail.htmlBody,
                }
              : undefined
          }
          onClose={() => {
            setComposing(false);
            setReplyToEmail(null);
          }}
          onSent={() => {
            toast.success("Email sent!");
            loadEmails(true);
          }}
        />
      )}

      {/* AI Assistant - Floating Chat Bubble */}
      {!showAI && (
        <button
          onClick={() => setShowAI(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg flex items-center justify-center z-40 transition-transform hover:scale-110"
          title="AI Email Assistant (or press Cmd+K)"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {showAI && (
        <EmailAI
          onClose={() => setShowAI(false)}
          onRefresh={() => loadEmails(true)}
        />
      )}
    </div>
  );
}
