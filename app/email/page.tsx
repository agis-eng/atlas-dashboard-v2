"use client";

import { useEffect, useMemo, useState } from "react";
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
  Settings,
  Reply,
  Forward,
  Plus,
  Brain,
  Sparkles,
  Ban,
} from "lucide-react";
import { EmailSettingsSheet } from "@/components/email-settings";
import { EmailCompose, type ComposeEmail, type ComposeMode } from "@/components/email-compose";
import { EmailRow } from "@/components/email-row";
import { EmailAI } from "@/components/email-ai";
import { cn } from "@/lib/utils";

interface Email {
  id: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  messageId?: string;
  references?: string[];
  read: boolean;
  starred: boolean;
  account: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

type ViewTab = "digest" | "all";
type DigestBucket = "topOfMind" | "needsReply" | "newsletters" | "spam" | "fyi" | "brainCandidates" | "unread";
type BulkPreviewAction = "archive" | "delete" | "show" | "categorize";

interface CommandPreview {
  mode: "command" | "manual";
  action: BulkPreviewAction;
  label: string;
  summary: string;
  description: string;
  emails: Email[];
  applyLabel: string;
  category?: "topOfMind" | "fyi" | "newsletter" | "spam";
  sender?: string;
}

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ViewTab>("digest");
  const [composing, setComposing] = useState<{ mode: ComposeMode; replyTo?: ComposeEmail } | null>(null);
  const [categorizationRules, setCategorizationRules] = useState<any>({
    topOfMind: [],
    fyi: [],
    newsletter: [],
    spam: []
  });
  const [brains, setBrains] = useState<any[]>([]);
  const [showAI, setShowAI] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [showBrainSelector, setShowBrainSelector] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [commandInput, setCommandInput] = useState("");
  const [commandPreview, setCommandPreview] = useState<CommandPreview | null>(null);
  const [commandError, setCommandError] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Load categorization rules and brains
    loadCategorizationRules();
    loadBrains();
    loadFolders();
    
    // Try to load from sessionStorage first
    const cached = sessionStorage.getItem('emails-cache');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - data.timestamp;
        const oneHour = 60 * 60 * 1000;
        
        // Always show cached data immediately
        setEmails(data.emails);
        setLoading(false);
        
        // Check quiet hours (9pm - 5am EST)
        const now = new Date();
        const estHour = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();
        const isQuietHours = estHour < 5 || estHour >= 21; // Before 5am or after 9pm
        
        if (isQuietHours) {
          console.log(`Quiet hours (9pm-5am EST). Using cached emails. Manual refresh available.`);
          return;
        }
        
        // Only auto-refresh if cache is older than 1 hour
        if (cacheAge < oneHour) {
          console.log(`Using cached emails (${Math.floor(cacheAge / 60000)} min old). Auto-refresh in ${Math.floor((oneHour - cacheAge) / 60000)} min.`);
          return;
        }
        
        console.log('Cache older than 1 hour, refreshing...');
      } catch (e) {
        // Invalid cache, continue to fetch
      }
    }
    loadEmails();
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setActiveTab((current) => (current === "digest" ? "all" : current));
      }
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  async function loadCategorizationRules() {
    try {
      const res = await fetch("/api/email/categorize");
      const data = await res.json();
      setCategorizationRules(data.categorization);
    } catch (err) {
      console.error("Failed to load categorization rules:", err);
    }
  }

  async function loadBrains() {
    try {
      const res = await fetch("/api/brain");
      const data = await res.json();
      setBrains(data.brains || []);
    } catch (err) {
      console.error("Failed to load brains:", err);
    }
  }

  async function loadFolders() {
    try {
      const res = await fetch("/api/email-folders");
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (err) {
      console.error("Failed to load folders:", err);
    }
  }

  function showToast(message: string, type: "success" | "error" = "success") {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    toast.className = `fixed top-4 right-4 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg z-50`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => document.body.contains(toast) && document.body.removeChild(toast), 300);
    }, 2200);
  }

  function updateEmailCache(nextEmails: Email[]) {
    try {
      sessionStorage.setItem('emails-cache', JSON.stringify({
        emails: nextEmails,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.warn('emails-cache write skipped:', err);
      try {
        sessionStorage.removeItem('emails-cache');
      } catch {}
    }
  }

  function getSelectedIdsForSection(sectionEmails: Email[]) {
    return sectionEmails.filter((email) => selected.has(email.id)).map((email) => email.id);
  }

  function sectionSelectedCount(sectionEmails: Email[]) {
    return getSelectedIdsForSection(sectionEmails).length;
  }

  function handleOpenEmail(email: Email) {
    // Mark as read when opened
    if (!email.read) {
      const updatedEmails = emails.map(e => 
        e.id === email.id ? { ...e, read: true } : e
      );
      setEmails(updatedEmails);
      
      // Update cache
      updateEmailCache(updatedEmails);
      
      // Mark as read on server
      fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: [email.id], action: "mark-read" }),
      }).catch(err => console.error("Failed to mark as read:", err));
    }
    
    setSelectedEmail(email);
  }

  async function addToBrain(brainId: string) {
    if (!selectedEmail) return;
    
    try {
      const res = await fetch(`/api/brain/${brainId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "email",
          sender: normalizeSender(selectedEmail.from) 
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to add to brain");
      }
      
      setShowBrainSelector(false);
      sessionStorage.removeItem('emails-cache');
      await loadBrains();
      await loadEmails(true);
      
      // Auto-dismiss toast after 2 seconds
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      toast.textContent = `Added ${normalizeSender(selectedEmail.from)} to brain`;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => document.body.contains(toast) && document.body.removeChild(toast), 300);
      }, 2000);
      
    } catch (err: any) {
      console.error("Failed to add to brain:", err);
      showToast(err?.message || "Failed to add to brain", "error");
    }
  }

  async function loadEmails(forceRefresh = false) {
    // Only show loading spinner if we don't have emails yet
    if (emails.length === 0) {
      setLoading(true);
    }
    
    try {
      const url = forceRefresh ? "/api/email-fetch?refresh=true" : "/api/email-fetch";
      const res = await fetch(url);
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (data.error) {
        console.error("Email fetch error:", data.error);
        // Show toast instead of alert
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg z-50';
        toast.innerHTML = `
          <div class="flex items-start gap-2">
            <span class="text-lg">⚠️</span>
            <div>
              <div class="font-medium">Failed to load emails</div>
              <div class="text-sm opacity-90 mt-1">${data.error}</div>
            </div>
          </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s';
          setTimeout(() => document.body.removeChild(toast), 300);
        }, 5000);
        return;
      }
      
      const emails = data.emails || [];
      
      // Debug: Show read/unread count
      const unreadCount = emails.filter((e: any) => !e.read).length;
      console.log(`Loaded ${emails.length} emails: ${unreadCount} unread, ${emails.length - unreadCount} read`);
      
      setEmails(emails);
      
      // Cache in sessionStorage
      updateEmailCache(data.emails || []);
    } catch (err: any) {
      console.error("Failed to load emails:", err);
      // Show toast instead of alert
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg z-50';
      toast.innerHTML = `
        <div class="flex items-start gap-2">
          <span class="text-lg">⚠️</span>
          <div>
            <div class="font-medium">Error loading emails</div>
            <div class="text-sm opacity-90 mt-1">${err.message}</div>
          </div>
        </div>
      `;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => document.body.removeChild(toast), 300);
      }, 5000);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  }

  async function performEmailAction(
    emailIds: string[],
    action: "delete" | "archive" | "mark-read" | "mark-unread" | "move",
    targetFolder?: string
  ) {
    const res = await fetch("/api/email-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailIds, action, targetFolder }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed to ${action} emails`);
    }

    return data;
  }

  function stageBulkPreview(action: "archive" | "delete", previewEmails: Email[], label: string, description: string) {
    if (previewEmails.length === 0) {
      showToast("No matching emails for that action", "error");
      return;
    }

    setCommandError("");
    setCommandPreview({
      mode: "manual",
      action,
      label,
      summary: `${action === "archive" ? "Archive" : "Delete"} ${previewEmails.length} email${previewEmails.length === 1 ? "" : "s"}`,
      description,
      emails: previewEmails,
      applyLabel: action === "archive" ? "Confirm archive" : "Confirm delete",
    });
  }

  async function archiveSelected() {
    stageBulkPreview(
      "archive",
      emails.filter((email) => selected.has(email.id)),
      "Bulk archive",
      "Previewing the currently selected emails before archiving them."
    );
  }

  async function deleteSelected() {
    stageBulkPreview(
      "delete",
      emails.filter((email) => selected.has(email.id)),
      "Bulk delete",
      "Previewing the currently selected emails before deleting them."
    );
  }

  async function deleteSectionEmails(sectionEmails: Email[]) {
    const previewEmails = sectionEmails.filter((email) => selected.has(email.id));
    stageBulkPreview(
      "delete",
      previewEmails,
      "Section delete",
      "Previewing the selected emails in this digest section before deleting them."
    );
  }

  async function handleDeleteEmail(id: string) {
    try {
      await performEmailAction([id], "delete");
      const newEmails = emails.filter(e => e.id !== id);
      setEmails(newEmails);
      updateEmailCache(newEmails);
      showToast("Email deleted");
    } catch (err) {
      console.error("Delete failed:", err);
      showToast("Failed to delete email", "error");
    }
  }

  async function handleArchiveEmail(id: string) {
    try {
      await performEmailAction([id], "archive");
      const newEmails = emails.filter(e => e.id !== id);
      setEmails(newEmails);
      updateEmailCache(newEmails);
      showToast("Email archived");
    } catch (err) {
      console.error("Archive failed:", err);
      showToast("Failed to archive email", "error");
    }
  }

  async function handleUnsubscribe(email: Email) {
    if (!confirm(`Unsubscribe from ${email.from}?\n\n🤖 AI will:\n1. Find the unsubscribe link\n2. Open your browser on the Mac\n3. Click the confirmation button automatically\n4. Verify success`)) {
      return;
    }

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
        // Show toast notification
        const toast = document.createElement('div');
        const bgColor = data.automated ? 'bg-green-600' : 'bg-blue-600';
        const icon = data.automated ? '🤖' : '✓';
        
        toast.className = `fixed top-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-md`;
        toast.innerHTML = `
          <div class="flex items-start gap-2">
            <span class="text-lg">${icon}</span>
            <div>
              <div class="font-medium">${data.automated ? 'Automated Unsubscribe' : 'Manual Unsubscribe'}</div>
              <div class="text-sm opacity-90 mt-1">${data.message}</div>
            </div>
          </div>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s';
          setTimeout(() => document.body.removeChild(toast), 300);
        }, 6000);

        // If manual action required, still open the tab
        if (data.manualAction && data.url) {
          window.open(data.url, '_blank');
        }

        // Auto-archive if fully automated
        if (data.automated && !data.needsVerification) {
          setTimeout(async () => {
            await handleArchiveEmail(email.id);
            setSelectedEmail(null);
          }, 2000);
        }
      } else {
        alert(data.message || "Could not find unsubscribe link");
      }
    } catch (err) {
      console.error("Unsubscribe failed:", err);
      alert("Failed to process unsubscribe request");
    } finally {
      setUnsubscribing(false);
    }
  }

  async function handleCategorize(sender: string, category: string) {
    try {
      const res = await fetch("/api/email/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, category }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not save categorization rule");
      }
      
      if (data?.rules) {
        setCategorizationRules(data.rules);
      } else {
        await loadCategorizationRules();
      }

      // Show toast notification
      const categoryNames: Record<string, string> = {
        topOfMind: 'Top of Mind',
        fyi: 'FYI',
        newsletter: 'Newsletter',
        spam: 'Spam'
      };
      
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-50';
      toast.innerHTML = `
        <div class="flex items-start gap-2">
          <span class="text-lg">✓</span>
          <div>
            <div class="font-medium">Categorized as ${categoryNames[category]}</div>
            <div class="text-sm opacity-90 mt-1">Future emails from ${sender.split('<')[0].trim()} will be automatically categorized</div>
          </div>
        </div>
      `;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => document.body.contains(toast) && document.body.removeChild(toast), 300);
      }, 4000);
      
      // Clear cache to force refresh with new categorization
      sessionStorage.removeItem('emails-cache');
      await loadEmails(true);
      return true;
    } catch (err: any) {
      console.error("Categorize failed:", err);
      showToast(err?.message || "Could not save categorization rule", "error");
      return false;
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
      setEmails(
        emails.map((e) =>
          selected.has(e.id) ? { ...e, read: true } : e
        )
      );
      setSelected(new Set());
    } catch (err) {
      console.error("Mark read failed:", err);
      alert("Failed to mark as read");
    }
  }

  async function moveSelectedToFolder() {
    const ids = Array.from(selected);
    if (!selectedFolder || ids.length === 0) return;
    try {
      await fetch("/api/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: ids, action: "move", targetFolder: selectedFolder }),
      });
      const newEmails = emails.filter((e) => !selected.has(e.id));
      setEmails(newEmails);
      setSelected(new Set());
      setSelectedFolder("");
      updateEmailCache(newEmails);
    } catch (err) {
      console.error("Move failed:", err);
      alert("Failed to move emails");
    }
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/email-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create folder");
      setFolders(data.folders || []);
      setSelectedFolder(name);
      setNewFolderName("");
    } catch (err: any) {
      console.error("Create folder failed:", err);
      alert(err.message || "Failed to create folder");
    }
  }

  const filtered = emails.filter(
    (e) =>
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.from.toLowerCase().includes(search.toLowerCase())
  );

  function normalizeSender(sender: string) {
    const match = sender.match(/<([^>]+)>/);
    return (match?.[1] || sender).trim().toLowerCase();
  }

  function asComposeEmail(email: Email): ComposeEmail {
    return {
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
  }

  function openCompose(mode: ComposeMode, email?: Email | null) {
    setComposing({
      mode,
      replyTo: email ? asComposeEmail(email) : undefined,
    });
  }

  function toggleSectionSelection(sectionEmails: Email[]) {
    const sectionIds = sectionEmails.map((email) => email.id);
    const allSelected = sectionIds.length > 0 && sectionIds.every((id) => selected.has(id));
    const newSelected = new Set(selected);

    if (allSelected) {
      sectionIds.forEach((id) => newSelected.delete(id));
    } else {
      sectionIds.forEach((id) => newSelected.add(id));
    }

    setSelected(newSelected);
  }

  function sectionFullySelected(sectionEmails: Email[]) {
    return sectionEmails.length > 0 && sectionEmails.every((email) => selected.has(email.id));
  }

  const matchesSender = (email: Email, senders: string[]) => {
    const normalizedEmailSender = normalizeSender(email.from);
    return senders.some((sender) => normalizeSender(sender) === normalizedEmailSender);
  };

  const brainSenders = useMemo(() => {
    const sources = new Set<string>();
    brains.forEach((brain) => {
      const emailSources = Array.isArray(brain?.email_sources) ? brain.email_sources : [];
      emailSources.forEach((source: string) => sources.add(normalizeSender(source)));
    });
    return sources;
  }, [brains]);

  const senderFrequency = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((email) => {
      const sender = normalizeSender(email.from);
      counts.set(sender, (counts.get(sender) || 0) + 1);
    });
    return counts;
  }, [filtered]);

  const emailSignals = useMemo(() => {
    return filtered.map((email) => {
      const sender = normalizeSender(email.from);
      const subject = email.subject.toLowerCase();
      const from = email.from.toLowerCase();
      const text = `${email.subject} ${email.snippet} ${email.body.slice(0, 280)}`.toLowerCase();
      const isNewsletter =
        matchesSender(email, categorizationRules.newsletter || []) ||
        subject.includes("newsletter") ||
        subject.includes("digest") ||
        from.includes("newsletter@") ||
        from.includes("noreply@") ||
        from.includes("no-reply@") ||
        text.includes("unsubscribe");
      const isSpam =
        matchesSender(email, categorizationRules.spam || []) ||
        subject.includes("spam") ||
        from.includes("spam@") ||
        text.includes("you have won") ||
        text.includes("claim your prize");
      const isTopOfMind =
        !isSpam &&
        (matchesSender(email, categorizationRules.topOfMind || []) ||
          subject.includes("urgent") ||
          subject.includes("action required") ||
          subject.includes("asap") ||
          text.includes("please respond") ||
          text.includes("need your input"));
      const isNeedsReply =
        !isSpam &&
        !isNewsletter &&
        !email.read &&
        (isTopOfMind ||
          subject.endsWith("?") ||
          text.includes("can you") ||
          text.includes("could you") ||
          text.includes("let me know") ||
          text.includes("reply back") ||
          text.includes("what do you think"));
      const isBrainCandidate =
        !isSpam &&
        !isNewsletter &&
        !brainSenders.has(sender) &&
        (isTopOfMind || isNeedsReply || (senderFrequency.get(sender) || 0) > 1);
      const isFYI =
        !isTopOfMind &&
        !isNeedsReply &&
        !isNewsletter &&
        !isSpam;

      return {
        email,
        isTopOfMind,
        isNeedsReply,
        isNewsletter,
        isSpam,
        isFYI,
        isBrainCandidate,
        isUnread: !email.read,
      };
    });
  }, [brainSenders, categorizationRules, filtered, senderFrequency]);

  const categorized = useMemo(
    () => ({
      topOfMind: emailSignals.filter((item) => item.isTopOfMind).map((item) => item.email),
      needsReply: emailSignals.filter((item) => item.isNeedsReply).map((item) => item.email),
      fyi: emailSignals.filter((item) => item.isFYI).map((item) => item.email),
      newsletters: emailSignals.filter((item) => item.isNewsletter).map((item) => item.email),
      spam: emailSignals.filter((item) => item.isSpam).map((item) => item.email),
      brainCandidates: emailSignals.filter((item) => item.isBrainCandidate).map((item) => item.email),
      unread: emailSignals.filter((item) => item.isUnread).map((item) => item.email),
    }),
    [emailSignals]
  );

  const digestStats = useMemo(
    () => [
      {
        key: "topOfMind" as DigestBucket,
        label: "Top of mind",
        count: categorized.topOfMind.length,
        tone: "border-orange-500/30 bg-orange-500/10 text-orange-200",
        hint: "Likely worth opening first.",
      },
      {
        key: "needsReply" as DigestBucket,
        label: "Needs reply",
        count: categorized.needsReply.length,
        tone: "border-blue-500/30 bg-blue-500/10 text-blue-200",
        hint: "Unread emails with reply signals.",
      },
      {
        key: "unread" as DigestBucket,
        label: "Unread",
        count: categorized.unread.length,
        tone: "border-sky-500/30 bg-sky-500/10 text-sky-200",
        hint: "Still untouched in this inbox view.",
      },
      {
        key: "newsletters" as DigestBucket,
        label: "Newsletters",
        count: categorized.newsletters.length,
        tone: "border-slate-500/30 bg-slate-500/10 text-slate-200",
        hint: "Good archive candidates.",
      },
      {
        key: "spam" as DigestBucket,
        label: "Likely spam",
        count: categorized.spam.length,
        tone: "border-red-500/30 bg-red-500/10 text-red-200",
        hint: "Safe to batch review first.",
      },
      {
        key: "brainCandidates" as DigestBucket,
        label: "Brain candidates",
        count: categorized.brainCandidates.length,
        tone: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
        hint: "Recurring senders not in a Brain yet.",
      },
    ],
    [categorized]
  );

  function previewEmailsForBucket(bucket: DigestBucket) {
    switch (bucket) {
      case "topOfMind":
        return categorized.topOfMind;
      case "needsReply":
        return categorized.needsReply;
      case "newsletters":
        return categorized.newsletters;
      case "spam":
        return categorized.spam;
      case "brainCandidates":
        return categorized.brainCandidates;
      case "unread":
        return categorized.unread;
      case "fyi":
      default:
        return categorized.fyi;
    }
  }

  function parseBucket(input: string): DigestBucket | null {
    const normalized = input.trim().toLowerCase();
    const bucketMap: Array<{ keys: string[]; bucket: DigestBucket }> = [
      { keys: ["top of mind", "top-of-mind", "priority"], bucket: "topOfMind" },
      { keys: ["needs reply", "need reply", "reply"], bucket: "needsReply" },
      { keys: ["newsletters", "newsletter"], bucket: "newsletters" },
      { keys: ["spam", "likely spam"], bucket: "spam" },
      { keys: ["brain candidates", "brain"], bucket: "brainCandidates" },
      { keys: ["unread"], bucket: "unread" },
      { keys: ["fyi"], bucket: "fyi" },
    ];

    const match = bucketMap.find(({ keys }) => keys.some((key) => normalized === key));
    return match?.bucket || null;
  }

  function buildCommandPreview(input: string): CommandPreview {
    const command = input.trim();
    const normalized = command.toLowerCase();

    if (!command) {
      throw new Error("Enter a command to preview it.");
    }

    const actionMatch = normalized.match(/^(archive|delete|show)\s+(.+)$/);
    if (actionMatch) {
      const [, verb, rawTarget] = actionMatch;
      const bucket = parseBucket(rawTarget);
      if (!bucket) {
        throw new Error("Try a known target like newsletters, spam, needs reply, unread, or brain candidates.");
      }

      const matchedEmails = previewEmailsForBucket(bucket);
      if (matchedEmails.length === 0) {
        throw new Error(`No emails matched "${rawTarget}" right now.`);
      }

      const labelMap: Record<DigestBucket, string> = {
        topOfMind: "top of mind",
        needsReply: "needs reply",
        newsletters: "newsletters",
        spam: "likely spam",
        brainCandidates: "brain candidates",
        unread: "unread",
        fyi: "FYI",
      };

      if (verb === "show") {
        return {
          mode: "command",
          action: "show",
          label: `Show ${labelMap[bucket]}`,
          summary: `Focus ${matchedEmails.length} ${labelMap[bucket]} email${matchedEmails.length === 1 ? "" : "s"}`,
          description: "This will switch to the full inbox list and preselect the matched emails for manual review.",
          emails: matchedEmails,
          applyLabel: "Open result set",
        };
      }

      return {
        mode: "command",
        action: verb as "archive" | "delete",
        label: `${verb[0].toUpperCase()}${verb.slice(1)} ${labelMap[bucket]}`,
        summary: `${verb === "archive" ? "Archive" : "Delete"} ${matchedEmails.length} ${labelMap[bucket]} email${matchedEmails.length === 1 ? "" : "s"}`,
        description: "Preview-first bulk action. Nothing happens until you confirm.",
        emails: matchedEmails,
        applyLabel: `Confirm ${verb}`,
      };
    }

    const categorizeMatch = command.match(/^categorize(?:\s+sender)?(?:\s+(.+?))?\s+as\s+(top of mind|topofmind|fyi|newsletter|spam)$/i);
    if (categorizeMatch) {
      const [, rawSender, rawCategory] = categorizeMatch;
      const category = rawCategory.toLowerCase() === "top of mind" || rawCategory.toLowerCase() === "topofmind"
        ? "topOfMind"
        : rawCategory.toLowerCase();
      const sender = rawSender?.trim() || selectedEmail?.from;

      if (!sender) {
        throw new Error("Open an email first or specify the sender in the command.");
      }

      const senderMatches = filtered.filter((email) => normalizeSender(email.from) === normalizeSender(sender));

      return {
        mode: "command",
        action: "categorize",
        label: `Categorize ${sender}`,
        summary: `Save ${senderMatches.length > 0 ? `${senderMatches.length} matching email${senderMatches.length === 1 ? "" : "s"} and ` : ""}future mail from this sender as ${rawCategory}`,
        description: "This saves a sender rule and refreshes the digest with the new categorization.",
        emails: senderMatches,
        applyLabel: "Save sender rule",
        category: category as "topOfMind" | "fyi" | "newsletter" | "spam",
        sender,
      };
    }

    throw new Error("Command not recognized. Try 'archive newsletters', 'delete spam', 'show needs reply', or 'categorize sender as newsletter'.");
  }

  function handleCommandPreview() {
    try {
      const preview = buildCommandPreview(commandInput);
      setCommandPreview(preview);
      setCommandError("");
    } catch (err: any) {
      setCommandPreview(null);
      setCommandError(err?.message || "Could not preview that command.");
    }
  }

  async function executeCommandPreview() {
    if (!commandPreview) return;

    setCommandBusy(true);
    const ids = commandPreview.emails.map((email) => email.id);

    try {
      if (commandPreview.action === "show") {
        setActiveTab("all");
        setSelected(new Set(ids));
        showToast(`Selected ${ids.length} email${ids.length === 1 ? "" : "s"} for review`);
      } else if (commandPreview.action === "categorize" && commandPreview.sender && commandPreview.category) {
        const saved = await handleCategorize(commandPreview.sender, commandPreview.category);
        if (!saved) {
          return;
        }
      } else if (commandPreview.action === "archive" || commandPreview.action === "delete") {
        await performEmailAction(ids, commandPreview.action);
        const idSet = new Set(ids);
        const nextEmails = emails.filter((email) => !idSet.has(email.id));
        const nextSelected = new Set(Array.from(selected).filter((id) => !idSet.has(id)));
        setEmails(nextEmails);
        setSelected(nextSelected);
        if (selectedEmail && idSet.has(selectedEmail.id)) {
          setSelectedEmail(null);
        }
        updateEmailCache(nextEmails);
        showToast(
          `${commandPreview.action === "archive" ? "Archived" : "Deleted"} ${ids.length} email${ids.length === 1 ? "" : "s"}`
        );
      }

      setCommandInput("");
      setCommandPreview(null);
      setCommandError("");
    } catch (err: any) {
      console.error("Command preview execute failed:", err);
      showToast(err?.message || "Failed to run command", "error");
    } finally {
      setCommandBusy(false);
    }
  }

  return (
    <div className="px-2 py-3 sm:p-6 sm:max-w-7xl sm:mx-auto space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 sm:h-8 sm:w-8" />
            Email
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {emails.length} emails loaded
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => openCompose("new")}>
            <Plus className="h-4 w-4 mr-2" />
            Compose
          </Button>
          <Button size="sm" variant="outline" onClick={() => loadEmails(true)} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <EmailSettingsSheet />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search emails..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="hidden md:grid gap-4 xl:grid-cols-[1.4fr,1fr]">
        <Card className="border-border/60 bg-zinc-950 text-zinc-50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-300" />
                Digest Overview
              </CardTitle>
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-200">
                {filtered.length} in view
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {digestStats.map((stat) => (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => {
                    setActiveTab("all");
                    setSelected(new Set(previewEmailsForBucket(stat.key).map((email) => email.id)));
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors hover:bg-white/5",
                    stat.tone
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">{stat.label}</span>
                    <span className="text-2xl font-semibold text-white">{stat.count}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-300">{stat.hint}</p>
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                <span className="font-medium text-zinc-100">Current read on the inbox:</span>
                <span>{categorized.topOfMind.length} top-of-mind</span>
                <span>•</span>
                <span>{categorized.needsReply.length} likely replies</span>
                <span>•</span>
                <span>{categorized.newsletters.length} newsletter sweeps</span>
                <span>•</span>
                <span>{categorized.brainCandidates.length} Brain candidates</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Inbox Command Center
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCommandPreview();
                  }
                }}
                placeholder="archive newsletters"
                className="font-mono text-sm"
              />
              <Button onClick={handleCommandPreview}>Preview</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "archive newsletters",
                "delete spam",
                "show needs reply",
                "categorize sender as newsletter",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setCommandInput(suggestion);
                    setCommandError("");
                  }}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {commandError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {commandError}
              </div>
            )}
            {commandPreview && (
              <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{commandPreview.label}</p>
                    <p className="text-sm text-muted-foreground">{commandPreview.summary}</p>
                  </div>
                  <Badge variant="secondary">{commandPreview.emails.length}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{commandPreview.description}</p>
                {commandPreview.emails.length > 0 && (
                  <div className="space-y-2">
                    {commandPreview.emails.slice(0, 3).map((email) => (
                      <div key={email.id} className="rounded-lg border bg-background px-3 py-2">
                        <p className="text-sm font-medium truncate">{email.subject}</p>
                        <p className="text-xs text-muted-foreground truncate">{email.from}</p>
                      </div>
                    ))}
                    {commandPreview.emails.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{commandPreview.emails.length - 3} more email{commandPreview.emails.length - 3 === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={executeCommandPreview} disabled={commandBusy}>
                    {commandBusy ? "Working..." : commandPreview.applyLabel}
                  </Button>
                  <Button variant="outline" onClick={() => setCommandPreview(null)} disabled={commandBusy}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <span className="text-xs text-muted-foreground">Bulk archive/delete now open a confirm preview first.</span>
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
          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Move to folder…</option>
            {folders.map((folder) => (
              <option key={folder} value={folder}>{folder}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={moveSelectedToFolder} disabled={!selectedFolder}>
            Move
          </Button>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder"
            className="h-8 w-40"
          />
          <Button size="sm" variant="outline" onClick={createFolder} disabled={!newFolderName.trim()}>
            Create Folder
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <span className="text-xs">Clear</span>
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ViewTab)}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="digest">
            <BookOpen className="h-4 w-4 mr-2" />
            Digest
          </TabsTrigger>
          <TabsTrigger value="all">
            <FileText className="h-4 w-4 mr-2" />
            All Emails
          </TabsTrigger>
        </TabsList>

        {/* Digest View */}
        <TabsContent value="digest" className="space-y-6 mt-6">
          {/* Top of Mind */}
          <Card>
            <CardHeader>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-orange-500" />
                  Top of Mind
                  <Badge variant="secondary">{categorized.topOfMind.length}</Badge>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {sectionSelectedCount(categorized.topOfMind) > 0 && (
                    <Button size="sm" variant="destructive" onClick={() => deleteSectionEmails(categorized.topOfMind)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete selected ({sectionSelectedCount(categorized.topOfMind)})
                    </Button>
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={sectionFullySelected(categorized.topOfMind)}
                      onChange={() => toggleSectionSelection(categorized.topOfMind)}
                    />
                    Check all emails
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {categorized.topOfMind.length === 0 && (
                <p className="text-sm text-muted-foreground">No urgent emails</p>
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

          <Card>
            <CardHeader>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Reply className="h-4 w-4 text-blue-500" />
                  Needs Reply
                  <Badge variant="secondary">{categorized.needsReply.length}</Badge>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {sectionSelectedCount(categorized.needsReply) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        stageBulkPreview(
                          "archive",
                          categorized.needsReply.filter((email) => selected.has(email.id)),
                          "Reply queue archive",
                          "Previewing the selected reply-queue emails before archiving them."
                        )
                      }
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archive selected ({sectionSelectedCount(categorized.needsReply)})
                    </Button>
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={sectionFullySelected(categorized.needsReply)}
                      onChange={() => toggleSectionSelection(categorized.needsReply)}
                    />
                    Check all emails
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {categorized.needsReply.length === 0 && (
                <p className="text-sm text-muted-foreground">No reply queue right now</p>
              )}
              {categorized.needsReply.map((email) => (
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
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-blue-500" />
                  FYI
                  <Badge variant="secondary">{categorized.fyi.length}</Badge>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {sectionSelectedCount(categorized.fyi) > 0 && (
                    <Button size="sm" variant="destructive" onClick={() => deleteSectionEmails(categorized.fyi)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete selected ({sectionSelectedCount(categorized.fyi)})
                    </Button>
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={sectionFullySelected(categorized.fyi)}
                      onChange={() => toggleSectionSelection(categorized.fyi)}
                    />
                    Check all emails
                  </label>
                </div>
              </div>
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
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  Newsletters
                  <Badge variant="secondary">{categorized.newsletters.length}</Badge>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {sectionSelectedCount(categorized.newsletters) > 0 && (
                    <Button size="sm" variant="destructive" onClick={() => deleteSectionEmails(categorized.newsletters)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete selected ({sectionSelectedCount(categorized.newsletters)})
                    </Button>
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={sectionFullySelected(categorized.newsletters)}
                      onChange={() => toggleSectionSelection(categorized.newsletters)}
                    />
                    Check all emails
                  </label>
                </div>
              </div>
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
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-red-500" />
                  Spam
                  <Badge variant="secondary">{categorized.spam.length}</Badge>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {sectionSelectedCount(categorized.spam) > 0 && (
                    <Button size="sm" variant="destructive" onClick={() => deleteSectionEmails(categorized.spam)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete selected ({sectionSelectedCount(categorized.spam)})
                    </Button>
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={sectionFullySelected(categorized.spam)}
                      onChange={() => toggleSectionSelection(categorized.spam)}
                    />
                    Check all emails
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {categorized.spam.length === 0 && (
                <p className="text-sm text-muted-foreground">No spam emails</p>
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
                {filtered.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-start gap-3 p-3 sm:p-4 hover:bg-muted/50 cursor-pointer transition-colors"
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
                        <p className={cn("font-medium text-sm truncate", !email.read && "font-bold")}>
                          {email.subject}
                        </p>
                        {!email.read && <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{email.from}</p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{email.snippet}</p>
                    </div>
                    <div className="text-right hidden sm:block">
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
      </Tabs>

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedEmail(null)}
        >
          <div
            className="bg-background w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-auto rounded-none sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b sticky top-0 bg-background z-10">
              <div className="flex items-start justify-between mb-4 gap-3">
                <h2 className="text-lg sm:text-xl font-semibold break-words">{selectedEmail.subject}</h2>
                <Button size="sm" variant="ghost" onClick={() => setSelectedEmail(null)}>
                  ✕
                </Button>
              </div>
              <div className="space-y-1 text-sm mb-4">
                <p className="text-foreground"><strong>From:</strong> <span className="text-foreground">{selectedEmail.from}</span></p>
                <p className="text-muted-foreground"><strong>To:</strong> {selectedEmail.to}</p>
                <p className="text-muted-foreground"><strong>Date:</strong> {new Date(selectedEmail.date).toLocaleString()}</p>
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-foreground font-medium mb-2">📎 Attachments ({selectedEmail.attachments.length})</p>
                    <div className="space-y-1">
                      {selectedEmail.attachments.map((att, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-foreground flex-1">{att.filename}</span>
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
              <div className="flex flex-wrap gap-2 mb-3 p-2 bg-muted/30 rounded-lg">
                <span className="text-xs font-medium text-muted-foreground self-center mr-2">Quick Categorize:</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-xs"
                  onClick={async () => {
                    await handleCategorize(selectedEmail.from, 'topOfMind');
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
                    await handleCategorize(selectedEmail.from, 'fyi');
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
                    await handleCategorize(selectedEmail.from, 'newsletter');
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
                    const saved = await handleCategorize(selectedEmail.from, 'spam');
                    if (saved) {
                      await handleDeleteEmail(selectedEmail.id);
                      setSelectedEmail(null);
                    }
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
                <Button size="sm" variant="outline" onClick={() => {
                  openCompose("reply", selectedEmail);
                  setSelectedEmail(null);
                }}>
                  <Reply className="h-4 w-4 mr-2" />
                  Reply
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  openCompose("forward", selectedEmail);
                  setSelectedEmail(null);
                }}>
                  <Forward className="h-4 w-4 mr-2" />
                  Forward
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await handleArchiveEmail(selectedEmail.id);
                    setSelectedEmail(null);
                  } catch (err) {
                    alert("Failed to archive");
                  }
                }}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Move to folder…</option>
                  {folders.map((folder) => (
                    <option key={folder} value={folder}>{folder}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={!selectedFolder} onClick={async () => {
                  try {
                    await fetch("/api/email-action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ emailIds: [selectedEmail.id], action: "move", targetFolder: selectedFolder }),
                    });
                    const newEmails = emails.filter((e) => e.id !== selectedEmail.id);
                    setEmails(newEmails);
                    updateEmailCache(newEmails);
                    setSelectedEmail(null);
                    setSelectedFolder("");
                  } catch (err) {
                    alert("Failed to move email");
                  }
                }}>
                  Move
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
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await handleDeleteEmail(selectedEmail.id);
                    setSelectedEmail(null);
                  } catch (err) {
                    showToast('Failed to delete email', 'error');
                  }
                }}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await fetch("/api/email-action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ emailIds: [selectedEmail.id], action: selectedEmail.read ? "mark-unread" : "mark-read" }),
                    });
                    setEmails(emails.map(e => e.id === selectedEmail.id ? { ...e, read: !e.read } : e));
                    setSelectedEmail({ ...selectedEmail, read: !selectedEmail.read });
                  } catch (err) {
                    showToast('Failed to update email', 'error');
                  }
                }}>
                  <Check className="h-4 w-4 mr-2" />
                  Mark {selectedEmail.read ? "Unread" : "Read"}
                </Button>
              </div>

              {/* Brain Selector Dropdown */}
              {showBrainSelector && (
                <div className="px-4 sm:px-6 pb-4">
                  <div className="bg-purple-600/10 dark:bg-purple-600/20 border border-purple-600/30 rounded-lg p-4">
                    <p className="text-sm font-medium mb-3 text-foreground">Add sender to Brain sources:</p>
                    {brains.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No Brains yet. <a href="/brain" className="text-purple-400 hover:text-purple-300 underline">Create one first</a>
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {brains.map(brain => {
                          const alreadyAdded = brain.email_sources?.some((source: string) => normalizeSender(source) === normalizeSender(selectedEmail?.from || ''));
                          return (
                            <Button
                              key={brain.id}
                              size="sm"
                              variant={alreadyAdded ? "default" : "outline"}
                              className={alreadyAdded 
                                ? "justify-start bg-purple-600 hover:bg-purple-700 text-white" 
                                : "justify-start bg-background hover:bg-muted text-foreground border-border"
                              }
                              onClick={() => addToBrain(brain.id)}
                            >
                              <span className="mr-2">{brain.icon}</span>
                              {brain.name}
                              {alreadyAdded && <span className="ml-auto text-xs">✓</span>}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 sm:p-6">
              {selectedEmail.htmlBody ? (
                <div 
                  className="email-content"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.htmlBody }}
                  style={{
                    maxWidth: '100%',
                    overflowX: 'auto'
                  }}
                />
              ) : (
                <div className="whitespace-pre-wrap">{selectedEmail.body}</div>
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
              .email-content td, .email-content th {
                padding: 8px;
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {composing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 sm:p-4">
          <div className="bg-background w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-auto rounded-none sm:rounded-lg">
            <EmailCompose
              mode={composing.mode}
              replyTo={composing.replyTo}
              onClose={() => setComposing(null)}
              onSent={() => setComposing(null)}
            />
          </div>
        </div>
      )}

      {/* AI Assistant - Floating Chat Bubble */}
      {!showAI && (
        <button
          onClick={() => setShowAI(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg flex items-center justify-center z-40 transition-transform hover:scale-110"
          title="AI Email Assistant"
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
