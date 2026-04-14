"use client";

import { use, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  ArrowLeft,
  FileText,
  Link as LinkIcon,
  StickyNote,
  Send,
  X,
  CheckSquare,
  Square,
  Eye,
  Upload,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  summaries?: any[];
  created: string;
  lastUpdated: string;
}

export default function BrainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [brain, setBrain] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);

  // Source selection
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
  const [selectedNotes, setSelectedNotes] = useState<Set<number>>(new Set());
  const [savedMsg, setSavedMsg] = useState<number | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Document preview
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  // Copy feedback
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Web search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ url: string; title: string; description: string }>>([]);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  async function copyMessage(content: string, idx: number) {
    await navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  // Add content
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLink, setNewLink] = useState({ url: "", title: "" });
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState("");

  useEffect(() => {
    loadBrain();
  }, [id]);

  // Auto-select all docs and notes when brain loads
  useEffect(() => {
    if (brain?.documents) {
      setSelectedDocs(new Set(brain.documents.map((_, i) => i)));
    }
    if (brain?.notes) {
      setSelectedNotes(new Set(brain.notes.map((_: any, i: number) => i)));
    }
  }, [brain?.documents?.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function loadBrain() {
    try {
      const res = await fetch(`/api/brain/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBrain(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function toggleDoc(idx: number) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (!brain?.documents) return;
    if (selectedDocs.size === brain.documents.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(brain.documents.map((_, i) => i)));
    }
  }

  async function sendMessage() {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    const newMessages = [...chatMessages, { role: "user", content: userMessage }];
    setChatMessages(newMessages);

    try {
      const res = await fetch(`/api/brain/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: chatMessages,
          selectedDocIndices: [...selectedDocs],
          selectedNoteIndices: [...selectedNotes],
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      let assistantMessage = "";
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantMessage += parsed.text;
                setChatMessages([...newMessages, { role: "assistant", content: assistantMessage }]);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function searchWeb() {
    if (!searchQuery.trim()) return;
    setSearchingWeb(true);
    try {
      const res = await fetch(`/api/brain/${id}/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchingWeb(false);
    }
  }

  async function addUrlToBrain(url: string, title: string) {
    setAddingUrl(url);
    try {
      const res = await fetch(`/api/brain/${id}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title }),
      });
      if (res.ok) {
        setSearchResults((prev) => prev.filter((r) => r.url !== url));
        loadBrain();
      }
    } catch { /* ignore */ }
    finally { setAddingUrl(null); }
  }

  async function addLink() {
    if (!newLink.url) return;
    await fetch(`/api/brain/${id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLink),
    });
    setNewLink({ url: "", title: "" });
    setShowAddLink(false);
    loadBrain();
  }

  async function addNote() {
    if (!newNote.trim()) return;
    await fetch(`/api/brain/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newNote }),
    });
    setNewNote("");
    setShowAddNote(false);
    loadBrain();
  }

  function toggleNote(idx: number) {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function saveMessageAsNote(content: string, idx: number) {
    await fetch(`/api/brain/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSavedMsg(idx);
    setTimeout(() => setSavedMsg(null), 2000);
    loadBrain();
  }

  async function deleteNote(noteIndex: number) {
    await fetch(`/api/brain/${id}/notes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: noteIndex }),
    });
    loadBrain();
  }

  async function deleteDocument(docIndex: number) {
    await fetch(`/api/brain/${id}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: docIndex }),
    });
    loadBrain();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!brain) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
        <Brain className="h-16 w-16 text-muted-foreground" />
        <p className="text-lg font-medium">Brain not found</p>
        <Button onClick={() => router.push("/brain")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Brains
        </Button>
      </div>
    );
  }

  const allDocs = brain.documents || [];
  const allLinks = brain.links || [];
  const allNotes = brain.notes || [];
  const totalSources = allDocs.length + allLinks.length + allNotes.length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/brain")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-2xl">{brain.icon}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{brain.name}</h1>
          <p className="text-xs text-muted-foreground truncate">{brain.description}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {selectedDocs.size}/{allDocs.length} sources active
        </Badge>
      </div>

      {/* Split Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: AI Chat */}
        <div className="flex-1 flex flex-col border-r min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Brain className="h-12 w-12 text-purple-600/30 mb-3" />
                <p className="font-medium mb-1">Chat with {brain.name}</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Ask questions about your sources. Use the checkboxes on the right to control which sources the AI reads from.
                </p>
                <div className="flex flex-wrap gap-2 mt-4 max-w-md">
                  {[
                    "Summarize all the key points",
                    "Create a step-by-step plan",
                    "What are the common themes?",
                    "What's the most important takeaway?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setChatInput(suggestion)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-purple-600/50 hover:text-purple-600 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={cn("max-w-[85%] group relative", msg.role === "user" ? "" : "")}>
                    <div
                      className={cn(
                        "rounded-lg p-3 text-sm whitespace-pre-wrap",
                        msg.role === "user" ? "bg-purple-600 text-white" : "bg-muted"
                      )}
                    >
                      {msg.content}
                    </div>
                    {msg.role === "assistant" && msg.content && (
                      <div className="flex items-center gap-1 mt-1">
                        <button
                          onClick={() => copyMessage(msg.content, i)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground bg-background border rounded-md shadow-sm transition-colors"
                          title="Copy"
                        >
                          {copiedIdx === i ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          {copiedIdx === i ? "Copied" : "Copy"}
                        </button>
                        <button
                          onClick={() => saveMessageAsNote(msg.content, i)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground bg-background border rounded-md shadow-sm transition-colors"
                          title="Save to notes"
                        >
                          {savedMsg === i ? <Check className="h-3 w-3 text-green-500" /> : <StickyNote className="h-3 w-3" />}
                          {savedMsg === i ? "Saved" : "Save to Notes"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 shrink-0">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about your sources..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                disabled={chatLoading}
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={chatLoading || !chatInput.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Sources Panel */}
        <div className="w-80 lg:w-96 flex flex-col overflow-hidden shrink-0">
          <div className="p-3 border-b flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold">Sources ({totalSources})</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => document.getElementById("brain-doc-upload")?.click()}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <input
                id="brain-doc-upload"
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  await fetch(`/api/brain/${id}/documents`, { method: "POST", body: formData });
                  e.target.value = "";
                  loadBrain();
                }}
              />
              {allDocs.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  {selectedDocs.size === allDocs.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Documents */}
            {allDocs.map((doc: any, i: number) => (
              <div
                key={`doc-${i}`}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg transition-colors group",
                  selectedDocs.has(i) ? "bg-purple-600/5" : "hover:bg-muted/50"
                )}
              >
                <button onClick={() => toggleDoc(i)} className="mt-0.5 shrink-0">
                  {selectedDocs.has(i) ? (
                    <CheckSquare className="h-4 w-4 text-purple-600" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  className="flex-1 min-w-0 text-left cursor-pointer"
                  onClick={() => doc.content ? setPreviewDoc(doc) : toggleDoc(i)}
                >
                  <p className="text-xs font-medium truncate hover:text-purple-600 transition-colors">{doc.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(doc.size / 1024).toFixed(1)} KB
                  </p>
                </button>
                <button
                  onClick={() => deleteDocument(i)}
                  className="p-1 shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Links */}
            {allLinks.length > 0 && (
              <>
                <div className="pt-3 pb-1 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <LinkIcon className="h-3 w-3" /> Links ({allLinks.length})
                  </p>
                </div>
                {allLinks.map((link: any, i: number) => (
                  <a
                    key={`link-${i}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-xs font-medium text-purple-600 truncate">{link.title || link.url}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{link.url}</p>
                  </a>
                ))}
              </>
            )}

            {/* Notes */}
            {allNotes.length > 0 && (
              <>
                <div className="pt-3 pb-1 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <StickyNote className="h-3 w-3" /> Notes ({allNotes.length})
                  </p>
                </div>
                {allNotes.map((note: any, i: number) => (
                  <div
                    key={`note-${i}`}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded-lg transition-colors",
                      selectedNotes.has(i) ? "bg-purple-600/5" : "hover:bg-muted/50"
                    )}
                  >
                    <button onClick={() => toggleNote(i)} className="mt-0.5 shrink-0">
                      {selectedNotes.has(i) ? (
                        <CheckSquare className="h-4 w-4 text-purple-600" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => setPreviewDoc({ name: `Note — ${new Date(note.date).toLocaleDateString()}`, content: note.content })}
                      className="flex-1 text-left cursor-pointer min-w-0"
                    >
                      <p className="text-xs line-clamp-3 hover:text-purple-600 transition-colors">{note.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(note.date).toLocaleDateString()}</p>
                    </button>
                    <button
                      onClick={() => deleteNote(i)}
                      className="p-1 shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </>
            )}

            {totalSources === 0 && (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No sources yet</p>
              </div>
            )}
          </div>

          {/* Web Search + Add source */}
          <div className="border-t p-2 shrink-0 space-y-2">
            {/* Web Search */}
            <div className="flex gap-1">
              <Input
                placeholder="Search the web..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchWeb()}
                className="h-8 text-xs flex-1"
              />
              <Button size="sm" className="h-8 px-2" onClick={searchWeb} disabled={searchingWeb}>
                {searchingWeb ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 bg-muted/30 rounded-lg p-1.5">
                {searchResults.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 p-1.5 rounded hover:bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.url}</p>
                    </div>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px] shrink-0"
                      onClick={() => addUrlToBrain(r.url, r.title)}
                      disabled={addingUrl === r.url}
                    >
                      {addingUrl === r.url ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t p-2 shrink-0 space-y-2">
            {showAddLink && (
              <div className="space-y-1.5 p-2 bg-muted/30 rounded-lg">
                <Input placeholder="URL" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} className="h-8 text-xs" />
                <Input placeholder="Title" value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })} className="h-8 text-xs" />
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={addLink}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddLink(false)}>Cancel</Button>
                </div>
              </div>
            )}
            {showAddNote && (
              <div className="space-y-1.5 p-2 bg-muted/30 rounded-lg">
                <textarea
                  placeholder="Add note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs resize-none"
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={addNote}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddNote(false)}>Cancel</Button>
                </div>
              </div>
            )}
            {!showAddLink && !showAddNote && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setShowAddLink(true)}>
                  <LinkIcon className="h-3 w-3 mr-1" /> Add Link
                </Button>
                <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setShowAddNote(true)}>
                  <StickyNote className="h-3 w-3 mr-1" /> Add Note
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPreviewDoc(null)}>
          <div
            className="bg-background rounded-xl border shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-purple-600 shrink-0" />
                <h3 className="font-medium text-sm truncate">{previewDoc.name}</h3>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setPreviewDoc(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{previewDoc.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
