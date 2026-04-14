"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Loader2,
  MessageCircle,
  Mic,
  Send,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceMessageAction } from "@/components/voice-message-action";
import { useVoice } from "@/components/voice-provider";
import type { VoiceContext } from "@/lib/voice-context";
import { cn } from "@/lib/utils";

// ── Types ──

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface ProjectChatProps {
  projectId: string;
  projectName: string;
}

// ── Suggestion chips shown when no history ──

const SUGGESTIONS = [
  "Summarize this project",
  "What tasks are pending?",
  "Show brain notes",
  "Draft a client update",
];

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
        // Code block (triple backtick) — simple pass-through
        if (line.startsWith("```")) {
          return <div key={i} className="font-mono text-xs opacity-70">{line}</div>;
        }

        // Headers
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

        // List items
        if (line.match(/^[-*•]\s/)) {
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className={cn("mt-1 flex-shrink-0", isUser ? "opacity-70" : "text-muted-foreground")}>•</span>
              <span>{renderInline(line.replace(/^[-*•]\s/, ""))}</span>
            </div>
          );
        }

        // Numbered list
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

        // Horizontal rule
        if (line.match(/^---+$/)) {
          return <hr key={i} className="border-current opacity-20 my-1" />;
        }

        // Empty line
        if (!line.trim()) {
          return <div key={i} className="h-1" />;
        }

        // Regular line
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

// ── Tool name formatter ──

function formatToolName(tool: string): string {
  switch (tool) {
    case "create_task":
      return "Creating task";
    case "update_project":
      return "Updating project";
    default:
      return `Running ${tool.replace(/_/g, " ")}`;
  }
}

// ── Tool success badge ──

function ToolBadge({ tool }: { tool: string }) {
  const label = tool === "create_task" ? "Task created" : tool === "update_project" ? "Project updated" : "Done";
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
      <Check className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Typing dots ──

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

// ── Main Component ──

export function ProjectChat({ projectId, projectName }: ProjectChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [completedTools, setCompletedTools] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { openVoice } = useVoice();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load history when panel opens for the first time
  useEffect(() => {
    if (!open || hasLoaded) return;

    const load = async () => {
      try {
        const res = await fetch(
          `/api/project-chat?projectId=${encodeURIComponent(projectId)}`
        );
        const data = await res.json();
        if (data.messages?.length) {
          setMessages(data.messages);
        }
      } catch {
        // Non-fatal — just start fresh
      }
      setHasLoaded(true);
    };

    load();
  }, [open, hasLoaded, projectId]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentTool]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || sending) return;

      const userMsg: Message = {
        id: `user_${Date.now()}`,
        role: "user",
        content: messageText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);
      setCurrentTool(null);
      setCompletedTools([]);

      const assistantId = `assistant_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          isStreaming: true,
        },
      ]);

      try {
        const res = await fetch("/api/project-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageText, projectId }),
        });

        if (!res.ok || !res.body) throw new Error("Stream unavailable");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === '"[DONE]"' || raw === "[DONE]") continue;

            try {
              const parsed = JSON.parse(raw);
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullContent }
                      : m
                  )
                );
              } else if (parsed.type === "tool_start") {
                setCurrentTool(parsed.tool);
              } else if (parsed.type === "tool_done") {
                setCurrentTool(null);
                setCompletedTools((prev) => [...prev, parsed.tool]);
              }
            } catch {
              // Malformed SSE chunk — skip
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Something went wrong. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setSending(false);
        setCurrentTool(null);
      }
    },
    [input, sending, projectId]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const showGreeting = hasLoaded && messages.length === 0;
  const unreadCount = 0; // Could track unread later

  function getVoiceContext(message?: Message): VoiceContext {
    return {
      source: "project-chat",
      route: `/projects/${projectId}`,
      threadId: projectId,
      threadLabel: projectName,
      projectId,
      projectName,
      messageId: message?.id,
      messageText: message?.content,
    };
  }

  function handleVoiceLaunch() {
    openVoice(getVoiceContext());
  }

  return (
    <>
      {/* ── Floating chat button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95",
          open
            ? "bg-foreground text-background shadow-xl"
            : "bg-orange-600 text-white hover:bg-orange-700"
        )}
        title={open ? "Close chat" : "Open AI chat"}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </button>

      {/* ── Slide-out panel ── */}
      <div
        ref={panelRef}
        className={cn(
          "fixed right-0 top-0 bottom-0 z-30 w-[420px] max-w-[100vw] bg-background border-l flex flex-col shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-orange-600/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{projectName}</p>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <p className="text-xs text-muted-foreground">AI Assistant</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {/* Loading skeleton */}
          {!hasLoaded && (
            <div className="space-y-3">
              {[80, 60, 90].map((w, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-8 rounded-2xl bg-muted animate-pulse",
                    i % 2 === 0 ? "mr-12" : "ml-12"
                  )}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          )}

          {/* Welcome message */}
          {showGreeting && (
            <div className="flex gap-2.5 items-start">
              <div className="h-7 w-7 rounded-full bg-orange-600/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                <MarkdownMessage
                  content={`Hi! I can help you with **${projectName}**. What would you like to know?`}
                  isUser={false}
                />
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2.5 items-start",
                msg.role === "user" ? "flex-row-reverse" : ""
              )}
            >
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-full bg-orange-600/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-orange-600" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 max-w-[85%]",
                  msg.role === "user"
                    ? "bg-orange-600 text-white rounded-tr-sm"
                    : "bg-muted rounded-tl-sm"
                )}
              >
                {msg.content ? (
                  <>
                    <MarkdownMessage content={msg.content} isUser={msg.role === "user"} />
                    {msg.role === "assistant" && msg.content ? (
                      <div className="mt-2">
                        <VoiceMessageAction
                          context={getVoiceContext(msg)}
                          label="Continue by voice"
                          className={cn(
                            "px-0",
                            msg.role === "assistant"
                              ? "text-muted-foreground hover:text-foreground"
                              : "text-white/80 hover:text-white"
                          )}
                        />
                      </div>
                    ) : null}
                  </>
                ) : msg.isStreaming ? (
                  <TypingDots />
                ) : null}
              </div>
            </div>
          ))}

          {/* Tool use indicator */}
          {currentTool && (
            <div className="flex gap-2.5 items-center">
              <div className="h-7 w-7 rounded-full bg-orange-600/10 flex items-center justify-center flex-shrink-0">
                <Loader2 className="h-3.5 w-3.5 text-orange-600 animate-spin" />
              </div>
              <div className="bg-muted/60 rounded-full px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-orange-500" />
                {formatToolName(currentTool)}...
              </div>
            </div>
          )}

          {/* Completed tool badges (shown briefly alongside streaming response) */}
          {completedTools.length > 0 && sending && (
            <div className="flex flex-wrap gap-1.5 pl-9">
              {completedTools.map((tool, i) => (
                <ToolBadge key={i} tool={tool} />
              ))}
            </div>
          )}
        </div>

        {/* Suggestion chips (only when empty) */}
        {showGreeting && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-orange-600/10 hover:text-orange-600 text-muted-foreground transition-colors border border-transparent hover:border-orange-600/20"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 border-t flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this project..."
              rows={1}
              disabled={sending}
              className="flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-500/20 disabled:opacity-50 leading-relaxed"
              style={{ minHeight: "38px", maxHeight: "120px" }}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={handleVoiceLaunch}
              className="text-muted-foreground hover:text-orange-600 flex-shrink-0 h-9 w-9 rounded-xl p-0"
              title="Start voice session"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
              className="bg-orange-600 hover:bg-orange-700 text-white flex-shrink-0 h-9 w-9 rounded-xl p-0"
              title="Send message"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Enter to send · Shift+Enter for new line · Esc to close
          </p>
        </div>
      </div>

      {/* Backdrop (mobile / click-outside) */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
