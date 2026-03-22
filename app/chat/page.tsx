"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  Plus,
  MessageSquare,
  User,
  Bot,
  Loader2,
} from "lucide-react";
import type { ChatMessage, ChatSession } from "@/lib/redis";

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res = await fetch("/api/chat-history?profile=erik");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      // Redis not configured yet — that's ok
    } finally {
      setLoadingSessions(false);
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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const messageText = input.trim();
    setInput("");

    // Create session if needed
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = generateSessionId();
      setCurrentSessionId(sessionId);
    }

    // Optimistic: add user message
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: messageText,
      timestamp: Date.now(),
      sessionId,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Start streaming
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
              fullContent += parsed.content;
              setStreamingContent(fullContent);
            } catch {
              // skip malformed chunks
            }
          }
        }
      }

      // Add assistant message
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        sessionId,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent("");

      // Refresh sessions
      loadSessions();
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
    }
  }

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
          {messages.length === 0 && !streamingContent ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-16 w-16 rounded-2xl bg-orange-600/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-orange-600" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
              <p className="text-muted-foreground text-sm max-w-md">
                Send a message to begin. Your conversations are saved and can be
                resumed from the sidebar.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
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
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </CardContent>
                  </Card>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming indicator */}
              {streamingContent && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-orange-600/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-orange-600" />
                  </div>
                  <Card className="max-w-[70%] bg-card">
                    <CardContent className="p-3">
                      <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {isStreaming && !streamingContent && (
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
          <form onSubmit={sendMessage} className="flex gap-2 max-w-3xl mx-auto">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={isStreaming}
              className="flex-1"
              autoFocus
            />
            <Button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
