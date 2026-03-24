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
  Calendar,
  MessageSquare,
  Settings,
  RefreshCw
} from "lucide-react";

interface Brain {
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

export default function BrainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [brain, setBrain] = useState<Brain | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "sources" | "chat">("overview");
  
  // New content forms
  const [newLink, setNewLink] = useState({ url: "", title: "" });
  const [newNote, setNewNote] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(true);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{role: string, content: string}>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

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
      }
    } catch (err) {
      console.error("Failed to load brain:", err);
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
    } catch (err) {
      console.error("Failed to load summaries:", err);
    } finally {
      setLoadingSummaries(false);
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
      await loadBrain();
    } catch (err) {
      console.error("Failed to add link:", err);
      alert("Failed to add link");
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
      await loadBrain();
    } catch (err) {
      console.error("Failed to add note:", err);
      alert("Failed to add note");
    }
  }

  async function removeSource(source: string) {
    if (!confirm(`Remove ${source} from sources?`)) return;
    
    try {
      await fetch(`/api/brain/${id}/sources`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: source }),
      });
      await loadBrain();
    } catch (err) {
      console.error("Failed to remove source:", err);
      alert("Failed to remove source");
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return;
    
    const userMessage = chatInput.trim();
    setChatInput("");
    setChatLoading(true);
    
    // Add user message
    const newMessages = [...chatMessages, { role: "user", content: userMessage }];
    setChatMessages(newMessages);
    
    try {
      const res = await fetch(`/api/brain/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage,
          history: chatMessages
        }),
      });
      
      if (!res.ok) {
        throw new Error("Chat request failed");
      }
      
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      
      let assistantMessage = "";
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantMessage += parsed.text;
                // Update UI with partial response
                setChatMessages([...newMessages, { role: "assistant", content: assistantMessage }]);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages([...newMessages, { 
        role: "assistant", 
        content: "Sorry, I encountered an error. Please try again." 
      }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!brain) {
    return (
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
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

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/brain")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <span className="text-4xl">{brain.icon}</span>
            {brain.name}
          </h1>
          <p className="text-muted-foreground mt-1">{brain.description}</p>
        </div>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-purple-600 text-purple-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("sources")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "sources"
              ? "border-purple-600 text-purple-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Sources & Content
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "chat"
              ? "border-purple-600 text-purple-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4 inline mr-2" />
          AI Chat
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Email Sources</span>
                <Badge>{brain.email_sources.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Documents</span>
                <Badge>{brain.documents?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Links</span>
                <Badge>{brain.links?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Notes</span>
                <Badge>{brain.notes?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between pt-3 border-t">
                <span className="text-sm text-muted-foreground">Update Schedule</span>
                <Badge variant="outline">{brain.schedule}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Latest Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                Latest Summary
                <Button size="sm" variant="ghost" onClick={loadSummaries}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSummaries ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </div>
              ) : summaries.length === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    No summaries yet. Summaries will be generated {brain.schedule} based on your email sources.
                  </p>
                  <Button size="sm" variant="outline" className="mt-4">
                    Generate Now
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground mb-2">{summaries[0].date}</p>
                    <div className="whitespace-pre-wrap text-sm border-l-2 border-purple-600/30 pl-3">
                      {summaries[0].preview}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab("sources")}>
                    View All Summaries
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sources Tab */}
      {activeTab === "sources" && (
        <div className="space-y-6">
          {/* Email Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Sources ({brain.email_sources.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {brain.email_sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No email sources yet. Open an email and click "Add to Brain" to start tracking senders.
                </p>
              ) : (
                <div className="space-y-2">
                  {brain.email_sources.map((source, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm">{source}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSource(source)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documents ({brain.documents?.length || 0})
                </span>
                <Button size="sm" onClick={() => document.getElementById('doc-upload')?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  Upload
                </Button>
                <input
                  id="doc-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    try {
                      const res = await fetch(`/api/brain/${id}/documents`, {
                        method: 'POST',
                        body: formData,
                      });
                      
                      if (res.ok) {
                        await loadBrain();
                        alert('Document uploaded successfully');
                      } else {
                        alert('Failed to upload document');
                      }
                    } catch (err) {
                      console.error('Upload failed:', err);
                      alert('Upload failed');
                    }
                    
                    e.target.value = '';
                  }}
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {brain.documents && brain.documents.length > 0 ? (
                <div className="space-y-2">
                  {brain.documents.map((doc: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border">
                      <div className="flex items-center gap-2 flex-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(doc.size / 1024).toFixed(1)} KB • {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No documents yet. Upload PDFs, Word docs, or text files.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Saved Links ({brain.links?.length || 0})
                </span>
                <Button size="sm" onClick={() => setShowLinkForm(!showLinkForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Link
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {showLinkForm && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <Input
                    placeholder="URL"
                    value={newLink.url}
                    onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                  />
                  <Input
                    placeholder="Title (optional)"
                    value={newLink.title}
                    onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addLink}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowLinkForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              
              {brain.links && brain.links.length > 0 ? (
                <div className="space-y-2">
                  {brain.links.map((link: any, i: number) => (
                    <div key={i} className="flex items-start justify-between p-2 rounded border">
                      <div className="flex-1">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline">
                          {link.title || link.url}
                        </a>
                        <p className="text-xs text-muted-foreground">{new Date(link.saved).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showLinkForm && (
                <p className="text-sm text-muted-foreground">No links yet</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Notes ({brain.notes?.length || 0})
                </span>
                <Button size="sm" onClick={() => setShowNoteForm(!showNoteForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Note
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {showNoteForm && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <Textarea
                    placeholder="Add your note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addNote}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowNoteForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              
              {brain.notes && brain.notes.length > 0 ? (
                <div className="space-y-3">
                  {brain.notes.map((note: any, i: number) => (
                    <div key={i} className="p-3 rounded border">
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">{new Date(note.date).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              ) : !showNoteForm && (
                <p className="text-sm text-muted-foreground">No notes yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === "chat" && (
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-600" />
              AI Chat
              <Badge variant="outline" className="ml-auto">
                {brain.email_sources.length} sources • {summaries.length} summaries
              </Badge>
            </CardTitle>
          </CardHeader>
          
          {/* Chat Messages */}
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Brain className="h-12 w-12 text-purple-600 mb-3" />
                <p className="font-medium mb-1">Ask me anything about {brain.name}</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  I have access to all summaries, links, notes, and knowledge from this Brain
                </p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
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
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          
          {/* Chat Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Ask a question..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
                disabled={chatLoading}
              />
              <Button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                Send
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
