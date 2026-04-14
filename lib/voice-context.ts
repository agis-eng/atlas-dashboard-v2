export const VOICE_CONTEXT_PARAM = "ctx";
export const PIPECAT_CONTEXT_PARAM = "atlas_ctx";
const MAX_MESSAGE_TEXT_LENGTH = 2_000;
const MAX_SUMMARY_TEXT_LENGTH = 600;
const MAX_HINTS = 6;
const MAX_HINT_TEXT_LENGTH = 160;

export type VoiceScope =
  | "global"
  | "main-chat"
  | "project"
  | "page";

export interface VoiceContext {
  source: string;
  route: string;
  threadId?: string;
  threadLabel?: string;
  sessionId?: string;
  projectId?: string;
  projectName?: string;
  messageId?: string;
  messageText?: string;
  launchedAt?: string;
  scope?: VoiceScope;
  scopeLabel?: string;
  moduleKey?: string;
  moduleLabel?: string;
  contextSummary?: string;
  contextHints?: string[];
}

function encodeBase64Url(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof window === "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  return decodeURIComponent(escape(atob(padded)));
}

function trimOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimOptionalList(values?: string[]) {
  if (!values?.length) return undefined;

  const trimmed = values
    .map((value) => trimOptional(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_HINTS)
    .map((value) => value.slice(0, MAX_HINT_TEXT_LENGTH));

  return trimmed.length > 0 ? trimmed : undefined;
}

export function sanitizeVoiceContext(context: VoiceContext): VoiceContext {
  return {
    source: trimOptional(context.source) ?? "unknown",
    route: trimOptional(context.route) ?? "/voice",
    threadId: trimOptional(context.threadId),
    threadLabel: trimOptional(context.threadLabel),
    sessionId: trimOptional(context.sessionId),
    projectId: trimOptional(context.projectId),
    projectName: trimOptional(context.projectName),
    messageId: trimOptional(context.messageId),
    messageText: trimOptional(context.messageText)?.slice(0, MAX_MESSAGE_TEXT_LENGTH),
    launchedAt: trimOptional(context.launchedAt) ?? new Date().toISOString(),
    scope: context.scope,
    scopeLabel: trimOptional(context.scopeLabel),
    moduleKey: trimOptional(context.moduleKey),
    moduleLabel: trimOptional(context.moduleLabel),
    contextSummary: trimOptional(context.contextSummary)?.slice(
      0,
      MAX_SUMMARY_TEXT_LENGTH
    ),
    contextHints: trimOptionalList(context.contextHints),
  };
}

export function encodeVoiceContext(context: VoiceContext) {
  return encodeBase64Url(JSON.stringify(sanitizeVoiceContext(context)));
}

export function decodeVoiceContext(value?: string | null): VoiceContext | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as VoiceContext;
    if (!parsed || typeof parsed !== "object") return null;
    return sanitizeVoiceContext(parsed);
  } catch {
    return null;
  }
}

export function buildVoiceHref(context: VoiceContext, pathname = "/voice") {
  const params = new URLSearchParams();
  params.set(VOICE_CONTEXT_PARAM, encodeVoiceContext(context));
  return `${pathname}?${params.toString()}`;
}
