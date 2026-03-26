"use client";

import { useMemo, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Power, Send, Volume2 } from "lucide-react";

type SessionHandle = any;

type LogItem = {
  id: string;
  role: "system" | "user" | "model" | "status" | "error";
  text: string;
};

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
  const [voiceName, setVoiceName] = useState("Kore");
  const [systemInstruction, setSystemInstruction] = useState(
    "You are Atlas Voice Lab. Answer briefly, naturally, and conversationally."
  );
  const [prompt, setPrompt] = useState("Say hello, introduce yourself, and explain what voice you are using.");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [sessionMeta, setSessionMeta] = useState<{ expiresAt?: string | null; voiceName?: string; model?: string } | null>(null);
  const sessionRef = useRef<SessionHandle | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackChainRef = useRef<Promise<void>>(Promise.resolve());

  const statusBadge = useMemo(() => {
    if (connected) return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Connected</Badge>;
    if (connecting) return <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">Connecting</Badge>;
    return <Badge variant="outline">Disconnected</Badge>;
  }, [connected, connecting]);

  function pushLog(role: LogItem["role"], text: string) {
    setLogs((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, role, text }]);
  }

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

  async function connect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/voice-lab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, voiceName, systemInstruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start Voice Lab session");

      const ai = new GoogleGenAI({ apiKey: data.token, apiVersion: "v1alpha" });
      const session = await ai.live.connect({
        model: data.model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: data.voiceName,
              },
            },
          },
        },
        callbacks: {
          onopen: () => {
            setConnected(true);
            setConnecting(false);
            pushLog("status", `Connected to ${data.model} with voice ${data.voiceName}`);
          },
          onmessage: async (message: any) => {
            const parts = message?.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part?.text) pushLog("model", part.text);
              if (part?.inlineData?.data) {
                pushLog("status", "Received audio response");
                await queuePcmPlayback(part.inlineData.data);
              }
            }
            if (message?.serverContent?.outputTranscription?.text) {
              pushLog("model", message.serverContent.outputTranscription.text);
            }
            if (message?.serverContent?.inputTranscription?.text) {
              pushLog("user", message.serverContent.inputTranscription.text);
            }
          },
          onerror: (error: any) => {
            pushLog("error", error?.message || "Voice Lab session error");
          },
          onclose: (event: any) => {
            setConnected(false);
            setConnecting(false);
            pushLog("status", `Session closed${event?.reason ? `: ${event.reason}` : ""}`);
          },
        },
      });

      sessionRef.current = session;
      setSessionMeta({ expiresAt: data.expiresAt, model: data.model, voiceName: data.voiceName });
    } catch (error: any) {
      setConnecting(false);
      setConnected(false);
      pushLog("error", error.message || "Failed to connect to Voice Lab");
    }
  }

  async function disconnect() {
    try {
      sessionRef.current?.close?.();
    } catch {}
    sessionRef.current = null;
    setConnected(false);
    pushLog("status", "Disconnected");
  }

  async function sendPrompt() {
    if (!sessionRef.current || !prompt.trim()) return;
    setSending(true);
    try {
      pushLog("user", prompt.trim());
      await sessionRef.current.sendRealtimeInput({ text: prompt.trim() });
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
            Experimental typed-to-voice sandbox for Gemini Live. This first pass lets us test model behavior and built-in voice selection before mic streaming.
          </p>
        </div>
        {statusBadge}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Setup</CardTitle>
            <CardDescription>Pick a model and voice, then connect to Gemini Live using a short-lived token.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Voice name</label>
              <Input value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="Kore" />
              <p className="text-xs text-muted-foreground">Google prebuilt voice name. Start with <span className="font-medium text-foreground">Kore</span>.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">System instruction</label>
              <Textarea value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} className="min-h-[120px]" />
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
                <div><span className="font-medium text-foreground">Voice:</span> {sessionMeta.voiceName}</div>
                {sessionMeta.expiresAt && <div><span className="font-medium text-foreground">Token expires:</span> {new Date(sessionMeta.expiresAt).toLocaleTimeString()}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Test</CardTitle>
            <CardDescription>Type a message, send it to Gemini Live, and hear the audio response.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[110px]"
                placeholder="Ask Gemini Live to introduce itself, explain a topic, or roleplay a phone greeting."
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={sendPrompt} disabled={!connected || sending || !prompt.trim()}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send prompt
              </Button>
              <Button variant="outline" onClick={() => setPrompt("Say hello, introduce yourself, and explain what voice you are using.") }>
                <Play className="h-4 w-4 mr-2" /> Reset sample
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
  );
}
