"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

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

export default function InboxPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadEmails();
  }, []);

  async function loadEmails(forceRefresh = false) {
    setLoading(true);
    try {
      const url = forceRefresh ? "/api/email-fetch?refresh=true" : "/api/email-fetch";
      const res = await fetch(url);
      const data = await res.json();
      setEmails(data.emails || []);
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
      // Remove from UI
      setEmails(emails.filter((e) => !selected.has(e.id)));
      setSelected(new Set());
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
      // Remove from UI
      setEmails(emails.filter((e) => !selected.has(e.id)));
      setSelected(new Set());
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete emails");
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
      // Update UI
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

  return (
    <div className="flex h-screen">
      {/* Email List */}
      <div className="w-96 border-r flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Inbox className="h-6 w-6" />
              Inbox
            </h1>
            <Button size="sm" variant="ghost" onClick={() => loadEmails(true)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emails..."
              className="pl-9"
            />
          </div>

          {/* Bulk Actions */}
          {selected.size > 0 && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={markAsRead}>
                <Check className="h-4 w-4 mr-1" />
                Mark Read
              </Button>
              <Button size="sm" variant="outline" onClick={archiveSelected}>
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
              <Button size="sm" variant="destructive" onClick={deleteSelected}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Email List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading emails...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No emails found
            </div>
          ) : (
            filtered.map((email) => (
              <div
                key={email.id}
                className={`border-b p-4 cursor-pointer hover:bg-muted/50 ${
                  selectedEmail?.id === email.id ? "bg-muted" : ""
                } ${email.read ? "opacity-60" : ""}`}
                onClick={() => setSelectedEmail(email)}
              >
                <div className="flex items-start gap-3">
                  <button
                    className="mt-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(email.id);
                    }}
                  >
                    {selected.has(email.id) ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm truncate">
                        {email.from.split("<")[0].trim()}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {email.account.split("@")[1]}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {email.subject}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {email.snippet}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(email.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Email Detail */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedEmail ? (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold mb-2">
                  {selectedEmail.subject}
                </h2>
                <p className="text-sm text-muted-foreground">
                  From: {selectedEmail.from}
                </p>
                <p className="text-sm text-muted-foreground">
                  To: {selectedEmail.to}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedEmail.date).toLocaleString()}
                </p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  Reply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEmails(emails.filter((e) => e.id !== selectedEmail.id));
                    setSelectedEmail(null);
                  }}
                >
                  <Archive className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (!confirm("Delete this email?")) return;
                    setEmails(emails.filter((e) => e.id !== selectedEmail.id));
                    setSelectedEmail(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap text-sm">
                {selectedEmail.body}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Mail className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p>Select an email to read</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
