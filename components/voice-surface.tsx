"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ExternalLink,
  Link2,
  Mic,
  PanelTop,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buildVoiceHref, type VoiceContext } from "@/lib/voice-context";
import { cn } from "@/lib/utils";

interface VoiceSurfaceProps {
  context: VoiceContext | null;
  pipecatBaseUrl: string | null;
  pipecatLaunchUrl: string | null;
}

function contextEntries(context: VoiceContext | null) {
  if (!context) return [];

  return [
    ["Source", context.source],
    ["Route", context.route],
    ["Thread", context.threadLabel ?? context.threadId],
    ["Session", context.sessionId],
    ["Project", context.projectName ?? context.projectId],
    ["Message", context.messageId],
    ["Launched", context.launchedAt],
  ].filter(([, value]) => Boolean(value));
}

function getScopeTone(scope?: VoiceContext["scope"]) {
  if (scope === "project") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }
  if (scope === "main-chat") {
    return "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  }
  if (scope === "page") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  return "border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}

export function VoiceSurface({
  context,
  pipecatBaseUrl,
  pipecatLaunchUrl,
}: VoiceSurfaceProps) {
  const [showEmbed, setShowEmbed] = useState(Boolean(pipecatLaunchUrl));
  const summaryItems = contextEntries(context);
  const displayContext = context ?? {
    source: "direct",
    route: "/voice",
  };
  const scopeLabel = context?.scopeLabel ?? "Direct Voice Session";
  const moduleLabel = context?.moduleLabel ?? "Voice";
  const contextHints = context?.contextHints ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-8 xl:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Mic className="h-3.5 w-3.5" />
              Voice
            </Badge>
            <Badge className={getScopeTone(context?.scope)}>{scopeLabel}</Badge>
            <Badge variant="outline">{moduleLabel}</Badge>
            {pipecatBaseUrl ? (
              <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                Pipecat configured
              </Badge>
            ) : (
              <Badge variant="outline">Pipecat not configured</Badge>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Atlas Voice
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Launch a Pipecat voice session with the current dashboard context,
              keep the handoff explicit, and preserve the text workflow.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={buildVoiceHref(displayContext)}
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <Link2 className="h-4 w-4" />
            Refresh context
          </Link>
          {pipecatLaunchUrl ? (
            <a
              href={pipecatLaunchUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "default" }), "gap-2")}
            >
              <ExternalLink className="h-4 w-4" />
              Open Pipecat
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voice Scope</CardTitle>
            <CardDescription>
              The enriched context this voice session should understand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-orange-600" />
                Context Summary
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {context?.contextSummary ||
                  "No launch context was provided. Open voice from a page or chat action to include a clearer working scope."}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Waypoints className="h-3.5 w-3.5" />
                Session Hints
              </div>
              {contextHints.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {contextHints.map((hint) => (
                    <div
                      key={hint}
                      className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
                    >
                      {hint}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No session hints were derived for this launch.
                </div>
              )}
            </div>

            <Separator />

            {summaryItems.length > 0 ? (
              <div className="space-y-3">
                {summaryItems.map(([label, value]) => (
                  <div key={label} className="space-y-1">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </div>
                    <div className="text-sm break-words">{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No launch context was provided. Open voice from chat, a project,
                or a sidebar page entry to attach working context.
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Message Text
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-sm whitespace-pre-wrap break-words">
                {context?.messageText || "No message text attached."}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Handoff Payload
              </div>
              <pre className="overflow-auto rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed">
                {JSON.stringify(displayContext, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[640px]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Pipecat Surface</CardTitle>
                <CardDescription>
                  Embed when possible, or open the full session in a separate
                  tab.
                </CardDescription>
              </div>
              {pipecatLaunchUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEmbed((value) => !value)}
                >
                  <PanelTop className="h-4 w-4" />
                  {showEmbed ? "Hide embed" : "Show embed"}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="h-full">
            {pipecatLaunchUrl ? (
              showEmbed ? (
                <div className="overflow-hidden rounded-xl border bg-muted/20">
                  <iframe
                    title="Pipecat Voice Session"
                    src={pipecatLaunchUrl}
                    className="h-[720px] w-full bg-background"
                    allow="camera; microphone; autoplay; clipboard-read; clipboard-write"
                  />
                </div>
              ) : (
                <div className="flex h-[720px] items-center justify-center rounded-xl border border-dashed bg-muted/10 p-6 text-center">
                  <div className="max-w-md space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Embed is hidden. Use the external launcher if the Pipecat
                      app blocks framing or needs a dedicated tab.
                    </p>
                    <a
                      href={pipecatLaunchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        buttonVariants({ variant: "default" }),
                        "gap-2"
                      )}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Pipecat in new tab
                    </a>
                  </div>
                </div>
              )
            ) : (
              <div className="flex h-[720px] items-center justify-center rounded-xl border border-dashed bg-muted/10 p-6 text-center">
                <div className="max-w-lg space-y-3">
                  <p className="text-sm font-medium">
                    `NEXT_PUBLIC_PIPECAT_WEBRTC_URL` is not set.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add the Pipecat app URL in the environment to enable embed
                    and external launch. The voice page is ready and still shows
                    the handoff payload for debugging.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
