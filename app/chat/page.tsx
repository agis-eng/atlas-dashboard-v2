"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VoiceMessageAction } from "@/components/voice-message-action";
import { useVoice } from "@/components/voice-provider";
import {
  Send,
  Plus,
  MessageSquare,
  User,
  Bot,
  Loader2,
  Mic,
  Search,
} from "lucide-react";
import type { ChatMessage, ChatSession } from "@/lib/redis";
import type { VoiceContext } from "@/lib/voice-context";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  search_projects: "Searching projects",
  get_project_details: "Loading project details",
  get_tasks: "Searching tasks",
  search_data: "Searching dashboard data",
  analyze_workload: "Analyzing workload",
};

const SUGGESTIONS = [
  "What are my active projects?",
  "Show overdue tasks",
  "Compare workload Erik vs Anton",
  "What's on my plate this week?",
];

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Simple inline markdown renderer ──

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="text-xs bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

function MarkdownMessage({ content, isUser }: { content: string; isUser: boolean }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("```")) {
          return <div key={i} className="font-mono text-xs opacity-70">{line}</div>;
        }
        if (line.startsWith("### ")) {
          return (
            <p key={i} className="font-semibold text-sm mt-2 first:mt-0">
              {renderInline(line.slice(4))}
            </p>
          );
        }
        if (line.startsWith("## ") || line.startsWith("# ")) {
          const text = line.replace(/^#{1,2}\s+/, "");
          return (
            <p key={i} className="font-semibold text-sm mt-2 first:mt-0">
              {renderInline(text)}
            </p>
          );
        }
        if (line.match(/^[-*•]\s/)) {
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className={cn("mt-0.5 flex-shrink-0", isUser ? "opacity-70" : "text-muted-foreground")}>•</span>
              <span>{renderInline(line.replace(/^[-*•]\s/, ""))}</span>
            </div>
          );
        }
        if (line.match(/^\d+\.\s/)) {
          const match = line.match(/^(\d+)\.\s(.*)$/);
          if (match) {
            return (
              <div key={i} className="flex gap-1.5 pl-1">
                <span className={cn("flex-shrink-0 tabular-nums", isUser ? "opacity-70" : "text-muted-foreground")}>{match[1]}.</span>
                <span>{renderInline(match[2])}</span>
              </div>
            );
          }
        }
        if (line.match(/^---+$/)) {
          return <hr key={i} className="border-current opacity-20 my-1" />;
        }
        if (!line.trim()) {
          return <div key={i} className="h-1" />;
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { openVoice } = useVoice();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem("atlas-chat-last-session", currentSessionId);
    }
  }, [currentSessionId]);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res = await fetch("/api/chat-history?profile=erik");
      const data = await res.json();
      const loaded: ChatSession[] = data.sessions || [];
      setSessions(loaded);

      if (loaded.length > 0) {
        const lastId = localStorage.getItem("atlas-chat-last-session");
        const target = loaded.find((s) => s.id === lastId) ? lastId! : loaded[0].id;
        setCurrentSessionId(target);
        const msgRes = await fetch(`/api/chat-history?sessionId=${target}`);
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
    } catch {
      // Redis not configured yet — that's ok
    } finally {
      setLoadingSessions(false);
    }
  }

  /** Refresh only the session sidebar without reloading messages */
  async function refreshSessionList() {
    try {
      const res = await fetch("/api/chat-history?profile=erik");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      // non-fatal
    }
  }

  async function loadMessages(sessionId: string) {
    try {
      const res = await fetch(`/api/chat-history?sessionId=${sessionId}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    }
  }

  function startNewChat() {
    const newId = generateSessionId();
    setCurrentSessionId(newId);
    setMessages([]);
    setStreamingContent("");
    inputRef.current?.focus();
  }

  async function selectSession(sessionId: string) {
    setCurrentSessionId(sessionId);
    setStreamingContent("");
    await loadMessages(sessionId);
  }

  async function sendMessage(e?: React.FormEvent, prefill?: string) {
    if (e) e.preventDefault();
    const messageText = (prefill ?? input).trim();
    if (!messageText || isStreaming) return;

    setInput("");

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = generateSessionId();
      setCurrentSessionId(sessionId);
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: messageText,
      timestamp: Date.now(),
      sessionId,
    };
    setMessages((prev) => [...prev, userMsg]);

    setIsStreaming(true);
    setStreamingContent("");

    try {
      const res = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          sessionId,
          profile: "erik",
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "tool_start") {
                setActiveTool(parsed.tool);
              } else if (parsed.type === "tool_done") {
                setActiveTool(null);
              } else if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        sessionId,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent("");

      // Refresh sidebar only — don't reload messages (avoids clobbering optimistic state)
      refreshSessionList();
    } catch (error) {
      console.error("Stream error:", error);
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: "assistant",
        content: "Failed to connect to chat. Please check the server is running and try again.",
        timestamp: Date.now(),
        sessionId,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setActiveTool(null);
    }
  }

  function getVoiceContext(message?: ChatMessage): VoiceContext {
    const currentSession = sessions.find((s) => s.id === currentSessionId);
    return {
      source: "main-chat",
      route: "/chat",
      threadId: currentSessionId || undefined,
      threadLabel: currentSession?.title,
      sessionId: currentSessionId || undefined,
      messageId: message?.id,
      messageText: message?.content,
    };
  }

  function handleVoiceLaunch() {
    openVoice(getVoiceContext());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const showEmpty = messages.length === 0 && !streamingContent;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - Chat Sessions */}
      <div className="w-64 border-r border-border flex flex-col bg-card/50">
        <div className="p-3 border-b border-border">
          <Button
            onClick={startNewChat}
            className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingSessions ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">
              No conversations yet
            </p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`w-full text-left rounded-lg p-2.5 text-sm transition-colors ${
                  currentSessionId === session.id
                    ? "bg-orange-600/10 text-orange-600"
                    : "hover:bg-muted/50 text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{session.title}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-2xl bg-orange-600/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-orange-600" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Ask Atlas anything</h2>
              <p className="text-muted-foreground text-sm max-w-md mb-6">
                Search projects and tasks, analyze workload, and get answers
                about your dashboard data.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(undefined, s)}
                    disabled={isStreaming}
                    className="text-sm px-4 py-2 rounded-full bg-muted hover:bg-orange-600/10 hover:text-orange-600 text-muted-foreground transition-colors border border-transparent hover:border-orange-600/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const isLastAssistant =
                  msg.role === "assistant" &&
                  idx === messages.length - 1;

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role !== "user" && (
                      <div className="h-8 w-8 rounded-full bg-orange-600/10 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-orange-600" />
                      </div>
                    )}
                    <Card
                      className={`max-w-[70%] ${
                        msg.role === "user"
                          ? "bg-orange-600 text-white border-orange-600"
                          : "bg-card"
                      }`}
                    >
                      <CardContent className="p-3">
                        <MarkdownMessage content={msg.content} isUser={msg.role === "user"} />
                        {isLastAssistant && msg.content ? (
                          <div className="mt-2">
                            <VoiceMessageAction
                              context={getVoiceContext(msg)}
                              label="Continue by voice"
                              className="px-0"
                            />
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                    {msg.role === "user" && (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streaming indicator */}
              {streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-orange-600/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-orange-600" />
                  </div>
                  <Card className="max-w-[70%] bg-card">
                    <CardContent className="p-3">
                      <MarkdownMessage content={streamingContent} isUser={false} />
                    </CardContent>
                  </Card>
                </div>
              )}

              {isStreaming && activeTool && (
                <div className="flex gap-3 justify-start items-center">
                  <div className="h-8 w-8 rounded-full bg-orange-600/10 flex items-center justify-center shrink-0">
                    <Search className="h-4 w-4 text-orange-600 animate-pulse" />
                  </div>
                  <span className="text-sm text-muted-foreground animate-pulse">
                    {TOOL_LABELS[activeTool] || activeTool}...
                  </span>
                </div>
              )}

              {isStreaming && !streamingContent && !activeTool && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-orange-600/10 flex items-center justify-center shrink-0">
                    <Loader2 className="h-4 w-4 text-orange-600 animate-spin" />
                  </div>
                  <Skeleton className="h-10 w-48" />
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 max-w-3xl mx-auto items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask Atlas anything..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-xl border border-input bg-transparent px-4 py-2.5 text-sm outline-none focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-500/20 disabled:opacity-50 leading-relaxed"
              style={{ minHeight: "42px", maxHeight: "120px" }}
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleVoiceLaunch}
              className="text-muted-foreground hover:text-orange-600 shrink-0"
              title="Start voice session"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center max-w-3xl mx-auto">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
