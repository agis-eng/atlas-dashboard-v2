import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

const CLIENTS_PATH = path.join(process.cwd(), "data", "clients.yaml");
const PROJECTS_PATH = path.join(process.cwd(), "data", "projects.yaml");
const CLIENT_BOTS_PATH = path.join(process.cwd(), "data", "clientBots.yaml");

type Client = {
  id: string;
  slug?: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  summary?: string;
  notes?: string;
  requestUrl?: string;
};

type Project = {
  id: string;
  name: string;
  clientId?: string;
  stage?: string;
  status?: string;
  liveUrl?: string;
  previewUrl?: string;
};

type ClientBotConfig = {
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
  updatedAt?: string;
};

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

async function ensureClientBotsFile() {
  try {
    await fs.access(CLIENT_BOTS_PATH);
  } catch {
    await fs.writeFile(CLIENT_BOTS_PATH, yaml.dump({ clientBots: [] }, { lineWidth: -1, noRefs: true }), "utf8");
  }
}

async function loadYaml<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return (yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as T) || fallback;
  } catch {
    return fallback;
  }
}

async function getContext(id: string) {
  await ensureClientBotsFile();
  const [clientsData, projectsData, botsData] = await Promise.all([
    loadYaml<{ clients: Client[] }>(CLIENTS_PATH, { clients: [] }),
    loadYaml<{ projects: Project[] }>(PROJECTS_PATH, { projects: [] }),
    loadYaml<{ clientBots: ClientBotConfig[] }>(CLIENT_BOTS_PATH, { clientBots: [] }),
  ]);

  const client = (clientsData.clients || []).find((entry) => entry.id === id || entry.slug === id);
  if (!client) return null;

  const projects = (projectsData.projects || []).filter((project) => project.clientId === client.id);
  const existing = (botsData.clientBots || []).find((entry) => entry.clientId === client.id);
  const websiteUrl = existing?.websiteUrl || projects.find((project) => project.liveUrl)?.liveUrl || projects.find((project) => project.previewUrl)?.previewUrl || "";
  const leadFields = existing?.leadFields?.length ? existing.leadFields : ["name", "phone", "email", "service needed", "timeline"];
  const faq = existing?.faq?.length ? existing.faq : [];
  const assistantName = existing?.assistantName || `${client.name} Assistant`;
  const businessSummary = existing?.businessSummary || client.summary || client.notes || "";
  const primaryCta = existing?.primaryCta || client.requestUrl || "";
  const escalationContact = existing?.escalationContact || client.email || client.contact || "";
  const welcomeMessage = existing?.welcomeMessage || `Hi — I'm the ${client.name} website assistant. I can answer questions, explain services, and help you take the next step.`;
  const systemPrompt = existing?.systemPrompt || `You are the ${assistantName} for ${client.name}. Answer only with information grounded in the provided business context, stay helpful and concise, avoid making up pricing or policies, and when unsure, direct the visitor to the primary call to action or escalation contact.`;

  return {
    client,
    projects,
    botsData,
    config: {
      clientId: client.id,
      enabled: existing?.enabled ?? false,
      channel: existing?.channel || "text-and-voice",
      assistantName,
      voiceName: existing?.voiceName || "Kore",
      websiteUrl,
      welcomeMessage,
      businessSummary,
      faq,
      leadFields,
      primaryCta,
      escalationContact,
      systemPrompt,
      updatedAt: existing?.updatedAt,
    } satisfies ClientBotConfig,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await getContext(id);
    if (!context) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      client: context.client,
      projects: context.projects,
      config: context.config,
      knowledgeSources: {
        clientSummary: context.client.summary || context.client.notes || "",
        linkedProjectCount: context.projects.length,
        projectNames: context.projects.map((project) => project.name),
      },
    });
  } catch (error) {
    console.error("Failed to load client bot config:", error);
    return NextResponse.json({ error: "Failed to load client bot config" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await getContext(id);
    if (!context) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const nextConfig: ClientBotConfig = {
      clientId: context.client.id,
      enabled: Boolean(body.enabled),
      channel: ["text", "voice", "text-and-voice"].includes(String(body.channel))
        ? String(body.channel) as ClientBotConfig["channel"]
        : "text-and-voice",
      assistantName: String(body.assistantName || `${context.client.name} Assistant`).trim(),
      voiceName: String(body.voiceName || "Kore").trim(),
      websiteUrl: String(body.websiteUrl || "").trim(),
      welcomeMessage: String(body.welcomeMessage || "").trim(),
      businessSummary: String(body.businessSummary || "").trim(),
      faq: normalizeStringArray(body.faq),
      leadFields: normalizeStringArray(body.leadFields),
      primaryCta: String(body.primaryCta || "").trim(),
      escalationContact: String(body.escalationContact || "").trim(),
      systemPrompt: String(body.systemPrompt || "").trim(),
      updatedAt: new Date().toISOString(),
    };

    const clientBots = (context.botsData.clientBots || []).filter((entry) => entry.clientId !== context.client.id);
    clientBots.push(nextConfig);
    clientBots.sort((a, b) => a.clientId.localeCompare(b.clientId));

    await fs.writeFile(
      CLIENT_BOTS_PATH,
      yaml.dump({ clientBots }, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false }),
      "utf8"
    );

    return NextResponse.json({ ok: true, config: nextConfig });
  } catch (error) {
    console.error("Failed to save client bot config:", error);
    return NextResponse.json({ error: "Failed to save client bot config" }, { status: 500 });
  }
}
