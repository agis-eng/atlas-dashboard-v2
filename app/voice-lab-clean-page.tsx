"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Power, Send, Volume2 } from "lucide-react";

type LogItem = {
  id: string;
  role: "system" | "user" | "model" | "status" | "error";
  text: string;
};

const MODEL_OPTIONS = [
  "gemini-3.1-flash-live-preview",
  "gemini-live-2.5-flash-preview",
  "gemini-2.0-flash-live-001",
];

function decodeBase64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

function pcm16ToAudioBuffer(buffer: ArrayBuffer, audioContext: AudioContext, sampleRate = 24000) {
  const pcm = new Int16Array(buffer);
  const audioBuffer = audioContext.createBuffer(1, pcm.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i += 1) {
    channelData[i] = Math.max(-1, Math.min(1, pcm[i] / 32768));
  }
  return audioBuffer;
}

export default function VoiceLabPage() {
  const [model, setModel] = useState("gemini-3.1-flash-live-preview");
  const [systemInstruction, setSystemInstruction] = useState(
    "You are Atlas in a voice call. Be brief, structured, useful, and no-fluff."
  );
  const [prompt, setPrompt] = useState("Say hello in one short sentence.");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [sessionMeta, setSessionMeta] = useState<{ expiresAt?: string | null; model?: string } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackChainRef = useRef<Promise<void>>(Promise.resolve());

  function pushLog(role: LogItem["role"], text: string) {
    setLogs((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, role, text }]);
  }

  const statusBadge = useMemo(() => {
    if (connected) return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Connected</Badge>;
    if (connecting) return <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">Connecting</Badge>;
    return <Badge variant="outline">Disconnected</Badge>;
  }, [connected, connecting]);

  async function ensureAudioContext() {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
    return audioContextRef.current;
  }

  async function queuePcmPlayback(base64Audio: string) {
    const audioContext = await ensureAudioContext();
    const pcmBuffer = decodeBase64ToArrayBuffer(base64Audio);
    const audioBuffer = pcm16ToAudioBuffer(pcmBuffer, audioContext, 24000);
    playbackChainRef.current = playbackChainRef.current.then(async () => {
      await new Promise<void>((resolve) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => resolve();
        source.start();
      });
    });
    return playbackChainRef.current;
  }

  useEffect(() => {
    return () => {
      try { socketRef.current?.close(); } catch {}
    };
  }, []);

  async function connect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/voice-lab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, systemInstruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start Voice Lab session");

      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(data.token)}`;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          config: {
            model: `models/${data.model}`,
            responseModalities: ["AUDIO"],
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
          },
        }));
        setConnected(true);
        setConnecting(false);
        setSessionMeta({ expiresAt: data.expiresAt, model: data.model });
        pushLog("status", `Connected to ${data.model}`);
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          const serverContent = message.serverContent || message;

          const parts = serverContent?.modelTurn?.parts || [];
          for (const part of parts) {
            if (part?.text) pushLog("model", part.text);
            if (part?.inlineData?.data) {
              pushLog("status", "Received audio response");
              await queuePcmPlayback(part.inlineData.data);
            }
          }

          if (serverContent?.outputTranscription?.text) {
            pushLog("model", serverContent.outputTranscription.text);
          }
          if (serverContent?.inputTranscription?.text) {
            pushLog("user", serverContent.inputTranscription.text);
          }
          if (message?.error?.message) {
            pushLog("error", message.error.message);
          }
        } catch (error: any) {
          pushLog("error", error?.message || "Failed to parse websocket message");
        }
      };

      ws.onerror = () => {
        pushLog("error", "WebSocket session error");
      };

      ws.onclose = (event) => {
        setConnected(false);
        setConnecting(false);
        pushLog("status", `Session closed${event?.reason ? `: ${event.reason}` : ""}`);
      };
    } catch (error: any) {
      setConnecting(false);
      setConnected(false);
      pushLog("error", error.message || "Failed to connect to Voice Lab");
    }
  }

  function disconnect() {
    try { socketRef.current?.close(); } catch {}
    socketRef.current = null;
    setConnected(false);
    pushLog("status", "Disconnected");
  }

  async function sendPrompt() {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !prompt.trim()) return;
    setSending(true);
    try {
      pushLog("user", prompt.trim());
      socketRef.current.send(JSON.stringify({ realtimeInput: { text: prompt.trim() } }));
      setPrompt("");
    } catch (error: any) {
      pushLog("error", error.message || "Failed to send prompt");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 md:p-8 xl:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Gemini Voice Lab</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clean-slate Live API test using Google&apos;s client-to-server WebSocket flow: ephemeral token, setup config, typed realtime input, and native audio playback.
          </p>
        </div>
        {statusBadge}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Setup</CardTitle>
            <CardDescription>Minimal setup only. No custom voice config. No SDK live wrapper.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Select value={model} onValueChange={(value) => setModel(value || MODEL_OPTIONS[0])}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">System instruction</label>
              <Textarea value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} className="min-h-[140px]" />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={connect} disabled={connecting || connected}>
                {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
                {connecting ? "Connecting…" : connected ? "Connected" : "Connect"}
              </Button>
              <Button variant="outline" onClick={disconnect} disabled={!connected && !connecting}>
                Disconnect
              </Button>
            </div>

            {sessionMeta && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1 text-muted-foreground">
                <div><span className="font-medium text-foreground">Model:</span> {sessionMeta.model}</div>
                {sessionMeta.expiresAt && <div><span className="font-medium text-foreground">Token expires:</span> {new Date(sessionMeta.expiresAt).toLocaleTimeString()}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Test</CardTitle>
              <CardDescription>Type a minimal prompt into the raw WebSocket session and listen for returned PCM audio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[110px]"
                placeholder="Say hello in one short sentence."
              />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={sendPrompt} disabled={!connected || sending || !prompt.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send prompt
                </Button>
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-md border border-border px-3 py-2">
                  <Volume2 className="h-4 w-4" /> Audio plays automatically when Gemini returns PCM chunks.
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-4 min-h-[360px] space-y-3 overflow-auto">
                {logs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No events yet. Connect, then send a prompt.</div>
                ) : (
                  logs.map((item) => (
                    <div key={item.id} className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.role}</div>
                      <div className="text-sm whitespace-pre-wrap">{item.text}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
