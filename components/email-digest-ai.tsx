"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Send, RefreshCw } from "lucide-react";

interface Email {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  read: boolean;
}

interface EmailDigestAIProps {
  emails: Email[];
  onAction: (action: string, emailIds: string[]) => Promise<void>;
}

export function EmailDigestAI({ emails, onAction }: EmailDigestAIProps) {
  const [digest, setDigest] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string }>
  >([]);
  const [chatProcessing, setChatProcessing] = useState(false);

  async function generateDigest() {
    setLoading(true);
    try {
      const emailSummaries = emails.slice(0, 30).map((e) => ({
        id: e.id,
        from: e.from?.split("<")[0]?.trim() || e.from,
        subject: e.subject,
        date: new Date(e.date).toLocaleDateString(),
        read: e.read,
        snippet: e.snippet?.substring(0, 80),
      }));

      const res = await fetch("/api/email/ai-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emailSummaries }),
      });

      if (res.ok) {
        const data = await res.json();
        setDigest(data.digest);
      }
    } catch {
      setDigest("Failed to generate digest. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatProcessing) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setChatProcessing(true);

    try {
      const emailContext = emails.slice(0, 30).map((e) => ({
        id: e.id,
        from: e.from?.split("<")[0]?.trim() || e.from,
        subject: e.subject,
        date: new Date(e.date).toLocaleDateString(),
        read: e.read,
        snippet: e.snippet?.substring(0, 80),
      }));

      const res = await fetch("/api/email/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          emails: emailContext,
          history: chatMessages.slice(-6),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.response },
        ]);

        // Execute any actions the AI suggested
        if (data.actions && data.actions.length > 0) {
          for (const action of data.actions) {
            await onAction(action.type, action.emailIds);
          }
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, something went wrong. Try again." },
      ]);
    } finally {
      setChatProcessing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* AI Digest */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI Inbox Digest
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={generateDigest}
              disabled={loading || emails.length === 0}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : digest ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {loading ? "Analyzing..." : digest ? "Refresh" : "Generate Digest"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {digest ? (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {digest}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click "Generate Digest" for an AI summary of your inbox — what needs
              attention, what can wait, and suggested actions.
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Chat */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            Chat with your Inbox
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Chat messages */}
          {chatMessages.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-sm rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-muted ml-8"
                      : "bg-blue-500/10 mr-8"
                  }`}
                >
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                    {msg.role === "user" ? "You" : "AI"}
                  </p>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              ))}
              {chatProcessing && (
                <div className="bg-blue-500/10 mr-8 rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                </div>
              )}
            </div>
          )}

          {/* Suggestions */}
          {chatMessages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {[
                "What needs my attention today?",
                "Archive all newsletters",
                "Delete all spam",
                "Who's waiting on a reply from me?",
                "Summarize emails from this week",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setChatInput(suggestion);
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Ask about your emails or give instructions..."
              className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
              disabled={chatProcessing}
            />
            <Button
              size="sm"
              onClick={sendChat}
              disabled={!chatInput.trim() || chatProcessing}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
