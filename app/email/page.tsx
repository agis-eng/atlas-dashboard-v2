"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { EmailSettingsSheet } from "@/components/email-settings";
import { EmailCompose } from "@/components/email-compose";
import { EmailRow } from "@/components/email-row";
import { cn } from "@/lib/utils";

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  read: boolean;
  starred: boolean;
  account: string;
}

type ViewTab = "digest" | "all";

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ViewTab>("digest");
  const [composing, setComposing] = useState(false);
  const [categorizationRules, setCategorizationRules] = useState<any>({
    topOfMind: [],
    fyi: [],
    newsletter: [],
    spam: []
  });

  useEffect(() => {
    // Load categorization rules
    loadCategorizationRules();
    
    // Try to load from sessionStorage first
    const cached = sessionStorage.getItem('emails-cache');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        // Check if cache is less than 5 minutes old
        if (Date.now() - data.timestamp < 5 * 60 * 1000) {
          setEmails(data.emails);
          setLoading(false);
          return;
        }
      } catch (e) {
        // Invalid cache, continue to fetch
      }
    }
    loadEmails();
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

  async function loadEmails(forceRefresh = false) {
    // Only show loading spinner if we don't have emails yet
    if (emails.length === 0) {
      setLoading(true);
    }
    
    try {
      const url = forceRefresh ? "/api/email-fetch?refresh=true" : "/api/email-fetch";
      const res = await fetch(url);
      const data = await res.json();
      setEmails(data.emails || []);
      
      // Cache in sessionStorage
      sessionStorage.setItem('emails-cache', JSON.stringify({
        emails: data.emails,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error("Failed to load emails:", err);
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
      
      // Update sessionStorage cache
      sessionStorage.setItem('emails-cache', JSON.stringify({
        emails: newEmails,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error("Archive failed:", err);
      alert("Failed to archive emails");
    }
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} email(s)?`)) return;
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
      
      // Update sessionStorage cache
      sessionStorage.setItem('emails-cache', JSON.stringify({
        emails: newEmails,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete emails");
    }
  }

  async function handleDeleteEmail(id: string) {
    await fetch("/api/email-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailIds: [id], action: "delete" }),
    });
    const newEmails = emails.filter(e => e.id !== id);
    setEmails(newEmails);
    
    // Update sessionStorage cache
    sessionStorage.setItem('emails-cache', JSON.stringify({
      emails: newEmails,
      timestamp: Date.now()
    }));
  }

  async function handleCategorize(sender: string, category: string) {
    try {
      await fetch("/api/email/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, category }),
      });
      
      // Clear cache to force refresh with new categorization
      sessionStorage.removeItem('emails-cache');
      
      alert(`All emails from ${sender} will now be categorized as ${category}`);
    } catch (err) {
      console.error("Categorize failed:", err);
      alert("Failed to save categorization rule");
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

  const filtered = emails.filter(
    (e) =>
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.from.toLowerCase().includes(search.toLowerCase())
  );

  // Helper to check if email sender matches any rule
  const matchesSender = (email: Email, senders: string[]) => {
    return senders.some(sender => email.from.includes(sender));
  };

  // Categorize emails for digest view
  const categorized = {
    topOfMind: filtered.filter(e => 
      matchesSender(e, categorizationRules.topOfMind || []) ||
      e.subject.toLowerCase().includes("urgent") ||
      e.subject.toLowerCase().includes("action required")
    ),
    fyi: filtered.filter(e => {
      // Skip if already categorized elsewhere
      if (matchesSender(e, categorizationRules.topOfMind || [])) return false;
      if (matchesSender(e, categorizationRules.newsletter || [])) return false;
      if (matchesSender(e, categorizationRules.spam || [])) return false;
      
      // Check if explicitly marked as FYI
      if (matchesSender(e, categorizationRules.fyi || [])) return true;
      
      // Default FYI criteria
      return !e.subject.toLowerCase().includes("urgent") &&
             !e.subject.toLowerCase().includes("newsletter") &&
             !e.from.includes("newsletter@") &&
             !e.from.includes("noreply@");
    }),
    newsletters: filtered.filter(e =>
      matchesSender(e, categorizationRules.newsletter || []) ||
      e.subject.toLowerCase().includes("newsletter") ||
      e.from.includes("newsletter@") ||
      e.from.includes("noreply@")
    ),
    spam: filtered.filter(e =>
      matchesSender(e, categorizationRules.spam || []) ||
      e.subject.toLowerCase().includes("spam") ||
      e.from.includes("spam@")
    ),
  };

  // Group by time for digest
  const now = new Date();
  const morning = filtered.filter(e => {
    const d = new Date(e.date);
    return d.getHours() < 12;
  });
  const afternoon = filtered.filter(e => {
    const d = new Date(e.date);
    return d.getHours() >= 12 && d.getHours() < 17;
  });
  const evening = filtered.filter(e => {
    const d = new Date(e.date);
    return d.getHours() >= 17;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Email
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {emails.length} emails loaded
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setComposing(true)}>
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
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <span className="text-xs">Clear</span>
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ViewTab)}>
        <TabsList>
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
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-orange-500" />
                Top of Mind
                <Badge variant="secondary">{categorized.topOfMind.length}</Badge>
              </CardTitle>
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
                  onOpen={setSelectedEmail}
                  onDelete={handleDeleteEmail}
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
            <CardContent className="space-y-2">
              {categorized.fyi.length === 0 && (
                <p className="text-sm text-muted-foreground">No FYI emails</p>
              )}
              {categorized.fyi.slice(0, 10).map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selected.has(email.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={setSelectedEmail}
                  onDelete={handleDeleteEmail}
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
                <Badge variant="secondary">{categorized.newsletters.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categorized.newsletters.length === 0 && (
                <p className="text-sm text-muted-foreground">No newsletters</p>
              )}
              {categorized.newsletters.slice(0, 5).map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selected.has(email.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={setSelectedEmail}
                  onDelete={handleDeleteEmail}
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
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categorized.spam.length === 0 && (
                <p className="text-sm text-muted-foreground">No spam emails</p>
              )}
              {categorized.spam.slice(0, 5).map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selected.has(email.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={setSelectedEmail}
                  onDelete={handleDeleteEmail}
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
                    className="flex items-start gap-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedEmail(email)}
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
                <h2 className="text-xl font-semibold">{selectedEmail.subject}</h2>
                <Button size="sm" variant="ghost" onClick={() => setSelectedEmail(null)}>
                  ✕
                </Button>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground mb-4">
                <p><strong>From:</strong> {selectedEmail.from}</p>
                <p><strong>To:</strong> {selectedEmail.to}</p>
                <p><strong>Date:</strong> {new Date(selectedEmail.date).toLocaleString()}</p>
              </div>
              {/* Quick Categorize */}
              <div className="flex gap-2 mb-3 p-2 bg-muted/30 rounded-lg">
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
                    await handleCategorize(selectedEmail.from, 'spam');
                    await loadEmails(true);
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Spam
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => {
                  // Reply - open compose with prefilled data
                  setComposing(true);
                  setSelectedEmail(null);
                }}>
                  <Reply className="h-4 w-4 mr-2" />
                  Reply
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  // Forward
                  setComposing(true);
                  setSelectedEmail(null);
                }}>
                  <Forward className="h-4 w-4 mr-2" />
                  Forward
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    await fetch("/api/email-action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ emailIds: [selectedEmail.id], action: "archive" }),
                    });
                    setEmails(emails.filter((e) => e.id !== selectedEmail.id));
                    setSelectedEmail(null);
                  } catch (err) {
                    alert("Failed to archive");
                  }
                }}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  if (!confirm("Delete this email?")) return;
                  try {
                    await fetch("/api/email-action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ emailIds: [selectedEmail.id], action: "delete" }),
                    });
                    setEmails(emails.filter((e) => e.id !== selectedEmail.id));
                    setSelectedEmail(null);
                  } catch (err) {
                    alert("Failed to delete");
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
                    alert("Failed to update");
                  }
                }}>
                  <Check className="h-4 w-4 mr-2" />
                  Mark {selectedEmail.read ? "Unread" : "Read"}
                </Button>
              </div>
            </div>
            <div className="p-6">
              <div className="whitespace-pre-wrap">{selectedEmail.body}</div>
            </div>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {composing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
            <EmailCompose mode="new" onClose={() => setComposing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
