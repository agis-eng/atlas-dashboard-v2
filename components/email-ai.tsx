"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Send, Loader2, Sparkles } from "lucide-react";

interface EmailAIProps {
  onClose: () => void;
  onRefresh: () => void;
}

export function EmailAI({ onClose, onRefresh }: EmailAIProps) {
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState("");
  const [streamedResponse, setStreamedResponse] = useState("");

  async function handleSend() {
    if (!message.trim() || processing) return;

    setProcessing(true);
    setResponse("");
    setStreamedResponse("");

    try {
      const res = await fetch('/api/email/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (!res.ok) {
        throw new Error('Failed to process request');
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          accumulated += chunk;
          setStreamedResponse(accumulated);
        }
      }

      setResponse(accumulated);

      // If action was performed, refresh emails
      if (accumulated.includes('✅')) {
        setTimeout(() => onRefresh(), 1000);
      }
    } catch (err) {
      setResponse('Failed to process request');
    } finally {
      setProcessing(false);
    }
  }

  const suggestions = [
    "Archive all emails from newsletter@example.com",
    "Delete all spam emails",
    "Mark all unread as read",
    "Show me emails from last week",
  ];

  return (
    <Card className="fixed right-6 bottom-24 w-96 shadow-2xl z-50 max-h-[500px] flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          Email AI Assistant
        </CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 flex-1 overflow-y-auto">
        {/* Response Area */}
        {(streamedResponse || response) && (
          <div className="p-3 rounded-lg bg-muted text-sm max-h-60 overflow-y-auto whitespace-pre-wrap">
            {streamedResponse || response}
          </div>
        )}

        {/* Quick Suggestions */}
        {!response && !processing && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try asking:</p>
            <div className="space-y-1">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(sug)}
                  className="w-full text-left text-xs px-3 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask me to manage your emails..."
            className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
            disabled={processing}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!message.trim() || processing}
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {response && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              setMessage("");
              setResponse("");
              setStreamedResponse("");
            }}
          >
            New Request
          </Button>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          AI can archive, delete, mark as read, categorize, and search emails.
        </p>
      </CardContent>
    </Card>
  );
}
