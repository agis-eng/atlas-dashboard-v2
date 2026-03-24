"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Send, Loader2, Sparkles } from "lucide-react";

interface CalendarAIProps {
  onClose: () => void;
  onEventCreated: () => void;
}

export function CalendarAI({ onClose, onEventCreated }: CalendarAIProps) {
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState("");

  async function handleSend() {
    if (!message.trim() || processing) return;

    setProcessing(true);
    setResponse("");

    try {
      const res = await fetch('/api/calendar/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      const data = await res.json();
      
      if (res.ok) {
        setResponse(data.response || 'Done!');
        if (data.eventCreated) {
          onEventCreated();
        }
      } else {
        setResponse(`Error: ${data.error}`);
      }
    } catch (err) {
      setResponse('Failed to process request');
    } finally {
      setProcessing(false);
    }
  }

  const suggestions = [
    "What's my schedule today?",
    "Schedule meeting tomorrow at 2pm",
    "Find time for 1-hour meeting",
    "Clear my calendar Friday afternoon",
  ];

  return (
    <Card className="fixed right-6 bottom-6 w-96 shadow-2xl z-50 max-h-[600px] overflow-y-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          Calendar AI Assistant
        </CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Response Area */}
        {response && (
          <div className="p-3 rounded-lg bg-muted text-sm">
            {response}
          </div>
        )}

        {/* Quick Suggestions */}
        {!response && (
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
            placeholder="Ask me anything about your calendar..."
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

        <p className="text-[10px] text-muted-foreground text-center">
          AI assistant is in beta. Responses may vary.
        </p>
      </CardContent>
    </Card>
  );
}
