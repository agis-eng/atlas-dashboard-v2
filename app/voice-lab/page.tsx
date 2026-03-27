"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mic, MicOff, Play, Power, Send, Sparkles, Volume2 } from "lucide-react";

type SessionHandle = any;

type LogItem = {
  id: string;
  role: "system" | "user" | "model" | "status" | "error";
  text: string;
};

type PersonaPreset = {
  id: string;
  label: string;
  prompt: string;
  systemInstruction: string;
};

type VoicePreset = {
  id: string;
  label: string;
  vibe: string;
};

const MODEL_OPTIONS = [
  "gemini-3.1-flash-live-preview",
  "gemini-live-2.5-flash-preview",
  "gemini-2.0-flash-live-001",
];

const VOICE_PRESETS: VoicePreset[] = [
  { id: "Puck", label: "Puck", vibe: "bright / friendly" },
  { id: "Charon", label: "Charon", vibe: "deeper / steady" },
  { id: "Kore", label: "Kore", vibe: "clean / balanced" },
  { id: "Fenrir", label: "Fenrir", vibe: "bold / assertive" },
  { id: "Aoede", label: "Aoede", vibe: "lighter / polished" },
  { id: "Leda", label: "Leda", vibe: "warm / composed" },
  { id: "Orus", label: "Orus", vibe: "corporate / direct" },
  { id: "Zephyr", label: "Zephyr", vibe: "airy / soft" },
];

const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "atlas",
    label: "Atlas Operator",
    prompt: "Answer like Atlas in a voice call: brief, structured, useful, no fluff.",
    systemInstruction:
      "You are Atlas Voice Lab. Speak like a calm operational assistant. Be precise, grounded, and concise. No exaggerated friendliness. Clarify uncertainty instead of guessing.",
  },
  {
    id: "receptionist",
    label: "AGIS Receptionist",
    prompt: "Greet a caller, explain AGIS briefly, and offer to help qualify their project.",
    systemInstruction:
      "You are a polished AGIS front-desk voice assistant. Sound warm, helpful, and confident. Keep answers short, gather lead details naturally, and guide callers toward a consult or next step.",
  },
  {
    id: "client-concierge",
    label: "Client Site Concierge",
    prompt: "Act like a website assistant for a local business and answer a first-time visitor's questions.",
    systemInstruction:
      "You are a branded client website concierge. Sound helpful and trustworthy. Explain services clearly, avoid inventing facts, and when uncertain, direct the visitor to contact or booking.",
  },
  {
    id: "sales",
    label: "Lead Qualifier",
    prompt: "Handle a new inbound lead and gather service type, budget, and timeline without sounding robotic.",
    systemInstruction:
      "You are a fast, natural lead-qualification assistant. Ask one thing at a time, sound human, and keep momentum toward booking a consult or collecting contact details.",
  },
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
  const [voiceName, setVoiceName] = useState("Kore");
  const [personaPreset, setPersonaPreset] = useState("atlas");
  const [systemInstruction, setSystemInstruction] = useState(
    "You are Atlas Voice Lab. Answer briefly, naturally, and conversationally."
  );
  const [prompt, setPrompt] = useState("Say hello, introduce yourself, and explain what voice you are using.");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [sessionMeta, setSessionMeta] = useState<{ expiresAt?: string | null; voiceName?: string; model?: string } | null>(null);
  const sessionRef = useRef<SessionHandle | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const preset = PERSONA_PRESETS.find((item) => item.id === personaPreset);
    if (!preset) return;
    setSystemInstruction(preset.systemInstruction);
    setPrompt(preset.prompt);
  }, [personaPreset]);

  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop(); } catch {}
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      try { sessionRef.current?.close?.(); } catch {}
    };
  }, []);

  const statusBadge = useMemo(() => {
    if (connected) return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Connected</Badge>;
    if (connecting) return <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">Connecting</Badge>;
    return <Badge variant="outline">Disconnected</Badge>;
  }, [connected, connecting]);

  const selectedVoice = useMemo(
    () => VOICE_PRESETS.find((voice) => voice.id === voiceName),
    [voiceName]
  );

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
          responseModalities: [Modality.TEXT, Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: systemInstruction }],
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
            const detail = error?.message || error?.error?.message || JSON.stringify(error) || "Voice Lab session error";
            pushLog("error", detail);
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
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setRecording(false);
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
      await sessionRef.current.sendClientContent({
        turns: [prompt.trim()],
      });
      setPrompt("");
    } catch (error: any) {
      pushLog("error", error.message || "Failed to send prompt");
    } finally {
      setSending(false);
    }
  }

  async function startMic() {
    if (!sessionRef.current || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredMime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));

      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0 || !sessionRef.current) return;
        try {
          await sessionRef.current.sendRealtimeInput({ audio: event.data });
        } catch (error: any) {
          pushLog("error", error.message || "Failed to send audio chunk");
        }
      };

      recorder.onerror = (event: any) => {
        pushLog("error", event?.error?.message || "Mic recorder error");
      };

      recorder.start(250);
      setRecording(true);
      pushLog("status", `Mic streaming started${preferredMime ? ` (${preferredMime})` : ""}`);
    } catch (error: any) {
      pushLog("error", error.message || "Failed to access microphone");
    }
  }

  async function stopMic() {
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    try {
      await sessionRef.current?.sendRealtimeInput?.({ audioStreamEnd: true });
    } catch {}
    setRecording(false);
    pushLog("status", "Mic streaming stopped");
  }

  return (
    <div className="p-6 md:p-8 xl:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Gemini Voice Lab</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Voice audition sandbox for Gemini Live. Test voices, swap personas, stream your mic, and tune what should later power phone lines and client site concierges.
          </p>
        </div>
        {statusBadge}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Setup</CardTitle>
            <CardDescription>Pick a model, voice, and persona preset, then connect with a short-lived token.</CardDescription>
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
              <label className="text-sm font-medium">Persona preset</label>
              <Select value={personaPreset} onValueChange={(value) => setPersonaPreset(value || "atlas")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose persona" />
                </SelectTrigger>
                <SelectContent>
                  {PERSONA_PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <Select value={voiceName} onValueChange={(value) => setVoiceName(value || "Kore")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose voice" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_PRESETS.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>{voice.label} · {voice.vibe}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Known Gemini voices: {VOICE_PRESETS.map((voice) => voice.id).join(", ")}. {selectedVoice ? `Current vibe: ${selectedVoice.vibe}.` : ""}
              </p>
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
                <div><span className="font-medium text-foreground">Voice:</span> {sessionMeta.voiceName}</div>
                {sessionMeta.expiresAt && <div><span className="font-medium text-foreground">Token expires:</span> {new Date(sessionMeta.expiresAt).toLocaleTimeString()}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voice Audition Board</CardTitle>
              <CardDescription>One-click swap between the known Gemini voices before routing any of them into Twilio or client bots.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {VOICE_PRESETS.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setVoiceName(voice.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${voiceName === voice.id ? "border-emerald-500 bg-emerald-500/10" : "border-border hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{voice.label}</div>
                    {voiceName === voice.id && <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Selected</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">{voice.vibe}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Test</CardTitle>
              <CardDescription>Type a message or stream your mic into Gemini Live, then hear the audio response.</CardDescription>
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
                {!recording ? (
                  <Button variant="secondary" onClick={startMic} disabled={!connected}>
                    <Mic className="h-4 w-4 mr-2" /> Start mic
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={stopMic}>
                    <MicOff className="h-4 w-4 mr-2" /> Stop mic
                  </Button>
                )}
                <Button variant="outline" onClick={() => {
                  const preset = PERSONA_PRESETS.find((item) => item.id === personaPreset);
                  setPrompt(preset?.prompt || "Say hello, introduce yourself, and explain what voice you are using.");
                }}>
                  <Play className="h-4 w-4 mr-2" /> Reset sample
                </Button>
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-md border border-border px-3 py-2">
                  <Volume2 className="h-4 w-4" /> Audio plays automatically when Gemini returns PCM chunks.
                </div>
              </div>

              <div className="text-xs text-muted-foreground">Rough cost guide: about <span className="font-medium text-foreground">2.9¢/min</span> for two-way live audio, plus minor text/thinking overhead.</div>
              <div className="rounded-lg border border-border bg-muted/20 p-4 min-h-[360px] space-y-3 overflow-auto">
                {logs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No events yet. Connect, then send a prompt or start the mic.</div>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where this goes next</CardTitle>
              <CardDescription>Voice Lab is now the staging ground for both Twilio phone lines and client-facing site bots.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" /> Phone agents</div>
                <p className="text-sm text-muted-foreground">Use this to choose the best live voice before we attach the toll-free Twilio number and wire AGIS / Atlas call personas.</p>
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" /> Client site concierge</div>
                <p className="text-sm text-muted-foreground">The same voice + prompt stack can power client business chatbots on their sites, with Atlas injecting the business context.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
