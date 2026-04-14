import {
  PIPECAT_CONTEXT_PARAM,
  type VoiceContext,
  encodeVoiceContext,
} from "@/lib/voice-context";

function getMutableUrl(baseUrl: string) {
  if (baseUrl.startsWith("/")) {
    return new URL(baseUrl, "https://atlas.local");
  }

  return new URL(baseUrl);
}

export function getPipecatBaseUrl() {
  const value = process.env.NEXT_PUBLIC_PIPECAT_WEBRTC_URL?.trim();
  return value ? value : null;
}

export function buildPipecatLaunchUrl(
  baseUrl: string,
  context?: VoiceContext | null
) {
  const url = getMutableUrl(baseUrl);

  if (context) {
    url.searchParams.set(PIPECAT_CONTEXT_PARAM, encodeVoiceContext(context));
    url.searchParams.set("source", context.source);
    url.searchParams.set("route", context.route);

    if (context.projectId) url.searchParams.set("projectId", context.projectId);
    if (context.threadId) url.searchParams.set("threadId", context.threadId);
    if (context.messageId) url.searchParams.set("messageId", context.messageId);
  }

  if (baseUrl.startsWith("/")) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}
