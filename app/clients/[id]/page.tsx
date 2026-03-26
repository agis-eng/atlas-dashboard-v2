"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Bot, ExternalLink, FolderOpen, Mail, Phone, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Project {
  id: string;
  name: string;
  status?: string;
  stage?: string;
  priority?: string;
}

interface Client {
  id: string;
  name: string;
  slug: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
  summary?: string;
  requestUrl?: string;
  projects?: Project[];
}

interface ClientBotConfig {
  clientId: string;
  enabled?: boolean;
  channel?: "text" | "voice" | "text-and-voice";
  assistantName?: string;
  voiceName?: string;
  websiteUrl?: string;
  welcomeMessage?: string;
  businessSummary?: string;
  faq?: string[];
  leadFields?: string[];
  primaryCta?: string;
  escalationContact?: string;
  systemPrompt?: string;
  updatedAt?: string | null;
}

const VOICE_OPTIONS = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"];

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [botConfig, setBotConfig] = useState<ClientBotConfig | null>(null);
  const [knowledgeSources, setKnowledgeSources] = useState<{ clientSummary?: string; linkedProjectCount?: number; projectNames?: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBot, setSavingBot] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadClient() {
      try {
        const [clientRes, botRes] = await Promise.all([
          fetch(`/api/clients/${encodeURIComponent(id)}`),
          fetch(`/api/client-bots/${encodeURIComponent(id)}`, { cache: "no-store" }),
        ]);
        const clientData = await clientRes.json();
        const botData = await botRes.json();
        if (!clientRes.ok) throw new Error(clientData.error || "Failed to load client");
        if (!botRes.ok) throw new Error(botData.error || "Failed to load client bot config");
        setClient(clientData);
        setBotConfig(botData.config);
        setKnowledgeSources(botData.knowledgeSources || null);
      } catch (err: any) {
        setError(err.message || "Failed to load client");
      } finally {
        setLoading(false);
      }
    }
    loadClient();
  }, [id]);

  const faqText = useMemo(() => (botConfig?.faq || []).join("\n"), [botConfig?.faq]);
  const leadFieldsText = useMemo(() => (botConfig?.leadFields || []).join("\n"), [botConfig?.leadFields]);

  function updateBotConfig(patch: Partial<ClientBotConfig>) {
    setBotConfig((prev) => ({ ...(prev || { clientId: String(id) }), ...patch }));
  }

  async function saveBotConfig() {
    if (!botConfig || !client) return;
    setSavingBot(true);
    try {
      const res = await fetch(`/api/client-bots/${encodeURIComponent(client.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...botConfig,
          faq: faqText,
          leadFields: leadFieldsText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save client bot config");
      setBotConfig(data.config);
      toast.success("Client bot config saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save client bot config");
    } finally {
      setSavingBot(false);
    }
  }

  if (loading) {
    return <div className="p-6 md:p-10 max-w-6xl mx-auto text-muted-foreground">Loading client...</div>;
  }

  if (error || !client) {
    return <div className="p-6 md:p-10 max-w-6xl mx-auto text-red-500">{error || "Client not found"}</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Clients
      </Link>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="text-muted-foreground mt-1">{client.summary || client.notes || client.id}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(client.email || client.contact) && (
              <a href={`mailto:${client.email || client.contact}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                <Mail className="h-4 w-4" />
                {client.email || client.contact}
              </a>
            )}
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-muted-foreground hover:underline">
                <Phone className="h-4 w-4" />
                {client.phone}
              </a>
            )}
            {client.requestUrl && (
              <a href={client.requestUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <ExternalLink className="h-4 w-4" />
                Request / Contact Link
              </a>
            )}
            {client.notes && <p className="text-muted-foreground">{client.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked Projects</CardTitle>
            <CardDescription>Projects connected to this client.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(client.projects || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked projects yet.</p>
            ) : (
              <div className="space-y-2">
                {(client.projects || []).map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/40 transition-colors">
                    <div>
                      <div className="font-medium text-sm">{project.name}</div>
                      <div className="text-xs text-muted-foreground">{project.stage || ""} {project.status ? `• ${project.status}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                      <FolderOpen className="h-3.5 w-3.5" />
                      {project.priority || "low"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {botConfig && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" /> Client Site Concierge
                </CardTitle>
                <CardDescription>
                  First-pass foundation for a client-facing text/voice assistant that knows this business and can later be embedded on their website.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={botConfig.enabled ? "default" : "outline"}>{botConfig.enabled ? "Enabled" : "Draft"}</Badge>
                {botConfig.updatedAt && (
                  <Badge variant="outline">Updated {new Date(botConfig.updatedAt).toLocaleString()}</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Assistant name</label>
                <Input value={botConfig.assistantName || ""} onChange={(e) => updateBotConfig({ assistantName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Website URL</label>
                <Input value={botConfig.websiteUrl || ""} onChange={(e) => updateBotConfig({ websiteUrl: e.target.value })} placeholder="https://example.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Channel</label>
                <Select value={botConfig.channel || "text-and-voice"} onValueChange={(value) => updateBotConfig({ channel: (value || "text-and-voice") as ClientBotConfig["channel"] })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text only</SelectItem>
                    <SelectItem value="voice">Voice only</SelectItem>
                    <SelectItem value="text-and-voice">Text + voice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Voice</label>
                <Select value={botConfig.voiceName || "Kore"} onValueChange={(value) => updateBotConfig({ voiceName: value || "Kore" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((voice) => (
                      <SelectItem key={voice} value={voice}>{voice}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border p-4">
              <input
                id="bot-enabled"
                type="checkbox"
                checked={Boolean(botConfig.enabled)}
                onChange={(e) => updateBotConfig({ enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="bot-enabled" className="text-sm">
                Enable this client bot config. Leave disabled while tuning the content and voice.
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Welcome message</label>
                <Textarea value={botConfig.welcomeMessage || ""} onChange={(e) => updateBotConfig({ welcomeMessage: e.target.value })} className="min-h-[120px]" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Business summary / knowledge base seed</label>
                <Textarea value={botConfig.businessSummary || ""} onChange={(e) => updateBotConfig({ businessSummary: e.target.value })} className="min-h-[120px]" />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">FAQ bullets</label>
                <Textarea
                  value={faqText}
                  onChange={(e) => updateBotConfig({ faq: e.target.value.split(/\n/).map((item) => item.trim()).filter(Boolean) })}
                  className="min-h-[150px]"
                  placeholder="One FAQ or answer per line"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Lead capture fields</label>
                <Textarea
                  value={leadFieldsText}
                  onChange={(e) => updateBotConfig({ leadFields: e.target.value.split(/\n/).map((item) => item.trim()).filter(Boolean) })}
                  className="min-h-[150px]"
                  placeholder="name\nphone\nemail\nservice needed"
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Primary CTA</label>
                <Input value={botConfig.primaryCta || ""} onChange={(e) => updateBotConfig({ primaryCta: e.target.value })} placeholder="Booking link / contact page / primary action" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Escalation contact</label>
                <Input value={botConfig.escalationContact || ""} onChange={(e) => updateBotConfig({ escalationContact: e.target.value })} placeholder="Email or phone for human handoff" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">System prompt</label>
              <Textarea value={botConfig.systemPrompt || ""} onChange={(e) => updateBotConfig({ systemPrompt: e.target.value })} className="min-h-[180px]" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="font-medium flex items-center gap-2"><Sparkles className="h-4 w-4" /> Knowledge sources ready now</div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Client summary/notes: {knowledgeSources?.clientSummary ? "available" : "missing"}</p>
                  <p>Linked projects: {knowledgeSources?.linkedProjectCount || 0}</p>
                  {!!knowledgeSources?.projectNames?.length && <p>Projects: {knowledgeSources.projectNames.join(", ")}</p>}
                </div>
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="font-medium flex items-center gap-2"><Sparkles className="h-4 w-4" /> Product direction</div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>This config is the foundation for:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>embedded site chatbot</li>
                    <li>optional voice concierge button</li>
                    <li>later Twilio phone persona for this client</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveBotConfig} disabled={savingBot}>
                <Save className="h-4 w-4 mr-2" />
                {savingBot ? "Saving..." : "Save client bot config"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
