"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  ArrowLeft,
  Mail,
  FileText,
  Link as LinkIcon,
  StickyNote,
  Plus,
  Trash2,
  Upload,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface BrainData {
  id: string;
  name: string;
  icon: string;
  description: string;
  schedule: string;
  email_sources: string[];
  documents?: any[];
  links?: any[];
  notes?: any[];
  created: string;
  lastUpdated: string;
}

interface EmailPreview {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  read: boolean;
}

export default function BrainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [brain, setBrain] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);

  // Content
  const [newLink, setNewLink] = useState({ url: "", title: "" });
  const [newNote, setNewNote] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Email previews
  const [sourceEmails, setSourceEmails] = useState<
    Record<string, EmailPreview[]>
  >({});
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [expandedNoteIndex, setExpandedNoteIndex] = useState<number | null>(null);
  const [loadingEmails, setLoadingEmails] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: string; content: string }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedNoteIndices, setSelectedNoteIndices] = useState<number[]>([]);
  const [selectedDocIndices, setSelectedDocIndices] = useState<number[]>([]);

  useEffect(() => {
    loadBrain();
    loadSummaries();
  }, [id]);

  async function loadBrain() {
    try {
      const res = await fetch(`/api/brain/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBrain(data);
        setSelectedNoteIndices(data.notes?.map((_: any, i: number) => i) || []);
        setSelectedDocIndices(data.documents?.map((_: any, i: number) => i) || []);
      }
    } catch {
      console.error("Failed to load brain");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummaries() {
    try {
      const res = await fetch(`/api/brain/${id}/summaries`);
      if (res.ok) {
        const data = await res.json();
        setSummaries(data.summaries || []);
      }
    } catch {
      console.error("Failed to load summaries");
    } finally {
      setLoadingSummaries(false);
    }
  }

  async function generateSummary() {
    setGeneratingSummary(true);
    try {
      const res = await fetch(`/api/brain/${id}/summaries`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setSummaries((prev) => [...prev, data.summary]);
        }
        toast.success("Summary generated");
      } else {
        toast.error("Failed to generate summary");
      }
    } catch {
      toast.error("Failed to generate summary");
    } finally {
      setGeneratingSummary(false);
    }
  }

  async function loadEmailsForSource(source: string) {
    if (sourceEmails[source]) {
      setExpandedSource(expandedSource === source ? null : source);
      return;
    }

    setLoadingEmails(true);
    setExpandedSource(source);
    try {
      // Load from cached emails
      const cached = sessionStorage.getItem("emails-cache");
      if (cached) {
        const data = JSON.parse(cached);
        const matching = (data.emails || []).filter((e: any) =>
          e.from?.includes(source)
        );
        setSourceEmails((prev) => ({ ...prev, [source]: matching }));
      }
    } catch {
      // silent
    } finally {
      setLoadingEmails(false);
    }
  }

  async function removeSource(source: string) {
    try {
      await fetch(`/api/brain/${id}/sources`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: source }),
      });
      toast.success(`Removed ${source}`);
      await loadBrain();
    } catch {
      toast.error("Failed to remove source");
    }
  }

  async function addLink() {
    if (!newLink.url) return;
    try {
      await fetch(`/api/brain/${id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLink),
      });
      setNewLink({ url: "", title: "" });
      setShowLinkForm(false);
      toast.success("Link added");
      await loadBrain();
    } catch {
      toast.error("Failed to add link");
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    try {
      await fetch(`/api/brain/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote }),
      });
      setNewNote("");
      setShowNoteForm(false);
      toast.success("Note added");
      await loadBrain();
    } catch {
      toast.error("Failed to add note");
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    const newMessages = [
      ...chatMessages,
      { role: "user", content: userMessage },
    ];
    setChatMessages(newMessages);

    try {
      const res = await fetch(`/api/brain/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, history: chatMessages, selectedDocIndices, selectedNoteIndices }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      let assistantMessage = "";
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantMessage += parsed.text;
                setChatMessages([
                  ...newMessages,
                  { role: "assistant", content: assistantMessage },
                ]);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      setChatMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded w-1/3" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!brain) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Brain not found</p>
            <Button onClick={() => router.push("/brain")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Brains
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latestSummary = summaries[summaries.length - 1];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/brain")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <span className="text-4xl">{brain.icon}</span>
            {brain.name}
          </h1>
          <p className="text-muted-foreground mt-1">{brain.description}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{brain.schedule}</Badge>
          <Badge variant="secondary">
            {brain.email_sources.length} sources
          </Badge>
        </div>
      </div>

      {/* ── Email Sources ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-purple-600" />
            Email Sources ({brain.email_sources.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brain.email_sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No email sources yet. Open an email and click "Add to Brain" to
              start tracking senders.
            </p>
          ) : (
            <div className="space-y-2">
              {brain.email_sources.map((source, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between p-2 rounded border hover:bg-muted/50 transition-colors">
                    <button
                      className="text-sm hover:underline flex-1 text-left flex items-center gap-2"
                      onClick={() => loadEmailsForSource(source)}
                    >
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {source}
                      {sourceEmails[source] && (
                        <Badge variant="secondary" className="text-[10px]">
                          {sourceEmails[source].length} emails
                        </Badge>
                      )}
                      {expandedSource === source ? (
                        <ChevronUp className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                      )}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeSource(source)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  {/* Inline email list */}
                  {expandedSource === source && (
                    <div className="ml-6 mt-1 space-y-1">
                      {loadingEmails ? (
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading emails...
                        </div>
                      ) : (sourceEmails[source] || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          No cached emails from this sender. Try refreshing your
                          inbox first.
                        </p>
                      ) : (
                        (sourceEmails[source] || []).map((email) => (
                          <div key={email.id}>
                            <button
                              className={cn(
                                "w-full text-left p-2 rounded border text-xs hover:bg-muted/50 transition-colors",
                                expandedEmail === email.id && "bg-muted/50"
                              )}
                              onClick={() =>
                                setExpandedEmail(
                                  expandedEmail === email.id
                                    ? null
                                    : email.id
                                )
                              }
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "font-medium truncate flex-1",
                                    !email.read && "font-bold"
                                  )}
                                >
                                  {email.subject}
                                </span>
                                <span className="text-muted-foreground shrink-0">
                                  {new Date(email.date).toLocaleDateString()}
                                </span>
                              </div>
                              {expandedEmail !== email.id && (
                                <p className="text-muted-foreground mt-0.5 line-clamp-1">
                                  {email.snippet}
                                </p>
                              )}
                            </button>

                            {/* Expanded email content */}
                            {expandedEmail === email.id && (
                              <div className="border rounded-b p-3 -mt-px bg-background">
                                <div className="text-xs text-muted-foreground mb-2">
                                  <strong>From:</strong> {email.from} |{" "}
                                  <strong>Date:</strong>{" "}
                                  {new Date(email.date).toLocaleString()}
                                </div>
                                {email.htmlBody ? (
                                  <div
                                    className="email-content text-xs"
                                    dangerouslySetInnerHTML={{
                                      __html: email.htmlBody,
                                    }}
                                    style={{
                                      maxWidth: "100%",
                                      overflowX: "auto",
                                    }}
                                  />
                                ) : (
                                  <div className="whitespace-pre-wrap text-xs">
                                    {email.body}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AI Summary ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              AI Summary
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={generateSummary}
              disabled={generatingSummary}
            >
              {generatingSummary ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {generatingSummary ? "Generating..." : "Generate Summary"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSummaries ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          ) : latestSummary ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-2">
                {new Date(latestSummary.date).toLocaleString()}
              </p>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm whitespace-pre-wrap border-l-2 border-purple-600/30 pl-4">
                {latestSummary.content}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No summaries yet. Click "Generate Summary" to create one from your
              email sources and notes.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── AI Chat ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-purple-600" />
            AI Chat
            <Badge variant="outline" className="ml-auto text-[10px]">
              {brain.email_sources.length} sources |{" "}
              {summaries.length} summaries
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Messages */}
          <div className="max-h-[400px] overflow-y-auto space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center py-6">
                <Brain className="h-10 w-10 text-purple-600 mx-auto mb-2" />
                <p className="text-sm font-medium">
                  Ask me anything about {brain.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  I have access to all summaries, emails, links, and notes
                </p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-purple-600 text-white"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Ask a question..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
              disabled={chatLoading}
            />
            <Button
              onClick={sendChatMessage}
              disabled={chatLoading || !chatInput.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Documents, Links, Notes ── */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Documents */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents ({brain.documents?.length || 0})
              </span>
              <div className="flex items-center gap-1">
                {brain.documents && brain.documents.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      const allSelected = selectedDocIndices.length === (brain.documents?.length || 0);
                      setSelectedDocIndices(allSelected ? [] : brain.documents!.map((_: any, i: number) => i));
                    }}
                  >
                    {selectedDocIndices.length === (brain.documents?.length || 0) ? "Deselect all" : "Select all"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() =>
                    document.getElementById("doc-upload")?.click()
                  }
                >
                  <Upload className="h-3 w-3" />
                </Button>
              </div>
              <input
                id="doc-upload"
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  try {
                    const res = await fetch(`/api/brain/${id}/documents`, {
                      method: "POST",
                      body: formData,
                    });
                    if (res.ok) {
                      toast.success("Document uploaded");
                      await loadBrain();
                    } else {
                      toast.error("Failed to upload");
                    }
                  } catch {
                    toast.error("Upload failed");
                  }
                  e.target.value = "";
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {brain.documents && brain.documents.length > 0 ? (
              <div className="space-y-2">
                {brain.documents.map((doc: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded border text-xs"
                  >
                    <Checkbox
                      checked={selectedDocIndices.includes(i)}
                      onCheckedChange={(checked) => {
                        setSelectedDocIndices(prev =>
                          checked ? [...prev, i] : prev.filter(idx => idx !== i)
                        );
                      }}
                    />
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 hover:text-foreground"
                      >
                        <p className="font-medium truncate underline-offset-2 hover:underline">{doc.name}</p>
                        <p className="text-muted-foreground">
                          {(doc.size / 1024).toFixed(1)} KB
                        </p>
                      </a>
                    ) : (
                      <div
                        className="flex-1 min-w-0"
                        title="Preview unavailable — re-upload to enable opening"
                      >
                        <p className="font-medium truncate">{doc.name}</p>
                        <p className="text-muted-foreground">
                          {(doc.size / 1024).toFixed(1)} KB · re-upload to open
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No documents yet</p>
            )}
          </CardContent>
        </Card>

        {/* Links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Links ({brain.links?.length || 0})
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setShowLinkForm(!showLinkForm)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {showLinkForm && (
              <div className="space-y-2 p-2 bg-muted/30 rounded">
                <Input
                  placeholder="URL"
                  value={newLink.url}
                  onChange={(e) =>
                    setNewLink({ ...newLink, url: e.target.value })
                  }
                  className="h-7 text-xs"
                />
                <Input
                  placeholder="Title"
                  value={newLink.title}
                  onChange={(e) =>
                    setNewLink({ ...newLink, title: e.target.value })
                  }
                  className="h-7 text-xs"
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 text-xs" onClick={addLink}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => setShowLinkForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {brain.links && brain.links.length > 0 ? (
              brain.links.map((link: any, i: number) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-2 rounded border text-xs hover:bg-muted/50"
                >
                  <p className="font-medium text-blue-600 truncate">
                    {link.title || link.url}
                  </p>
                </a>
              ))
            ) : !showLinkForm ? (
              <p className="text-xs text-muted-foreground">No links yet</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                Notes ({brain.notes?.length || 0})
              </span>
              <div className="flex items-center gap-1">
                {brain.notes && brain.notes.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      const allSelected = selectedNoteIndices.length === (brain.notes?.length || 0);
                      setSelectedNoteIndices(allSelected ? [] : brain.notes!.map((_: any, i: number) => i));
                    }}
                  >
                    {selectedNoteIndices.length === (brain.notes?.length || 0) ? "Deselect all" : "Select all"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setShowNoteForm(!showNoteForm)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {showNoteForm && (
              <div className="space-y-2 p-2 bg-muted/30 rounded">
                <Textarea
                  placeholder="Add your note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  className="text-xs"
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 text-xs" onClick={addNote}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => setShowNoteForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {brain.notes && brain.notes.length > 0 ? (
              brain.notes.map((note: any, i: number) => {
                const isExpanded = expandedNoteIndex === i;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded border text-xs transition-colors",
                      isExpanded && "bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={selectedNoteIndices.includes(i)}
                      onCheckedChange={(checked) => {
                        setSelectedNoteIndices(prev =>
                          checked ? [...prev, i] : prev.filter(idx => idx !== i)
                        );
                      }}
                      className="mt-0.5"
                    />
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left cursor-pointer hover:text-foreground"
                      onClick={() => setExpandedNoteIndex(isExpanded ? null : i)}
                    >
                      <p className={cn("whitespace-pre-wrap", !isExpanded && "line-clamp-2")}>
                        {note.content}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {new Date(note.date).toLocaleDateString()}
                      </p>
                    </button>
                  </div>
                );
              })
            ) : !showNoteForm ? (
              <p className="text-xs text-muted-foreground">No notes yet</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
