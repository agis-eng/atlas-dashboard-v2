"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GripHorizontal, Loader2, Mic, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVoice } from "@/components/voice-provider";
import { buildPipecatLaunchUrl } from "@/lib/pipecat";
import { cn } from "@/lib/utils";

const WINDOW_WIDTH = 380;
const WINDOW_MIN_HEIGHT = 320;
const WINDOW_MAX_HEIGHT = 680;
const MOBILE_BREAKPOINT = 768;
const WINDOW_GAP = 16;
const HEADER_OFFSET = 84;

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getSidebarOffset() {
  if (typeof window === "undefined") return 272;
  if (isMobileViewport()) return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--sidebar-width")
    .trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 256;
}

function getWindowDimensions() {
  if (typeof window === "undefined") {
    return { width: WINDOW_WIDTH, height: 620 };
  }

  if (isMobileViewport()) {
    return {
      width: Math.max(280, window.innerWidth - WINDOW_GAP * 2),
      height: Math.max(320, window.innerHeight - HEADER_OFFSET - WINDOW_GAP),
    };
  }

  return {
    width: WINDOW_WIDTH,
    height: Math.min(
      WINDOW_MAX_HEIGHT,
      Math.max(WINDOW_MIN_HEIGHT, window.innerHeight - HEADER_OFFSET - WINDOW_GAP)
    ),
  };
}

function getDefaultPosition() {
  if (typeof window === "undefined") {
    return { x: 300, y: 96 };
  }

  if (isMobileViewport()) {
    return {
      x: WINDOW_GAP,
      y: HEADER_OFFSET,
    };
  }

  const sidebarOffset = getSidebarOffset();
  const maxX = window.innerWidth - WINDOW_WIDTH - WINDOW_GAP;
  const preferredX = window.innerWidth - WINDOW_WIDTH - 32;
  const x = Math.max(sidebarOffset + WINDOW_GAP, Math.min(preferredX, maxX));

  return {
    x,
    y: 96,
  };
}

function clampPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === "undefined") return { x, y };

  const minX = getSidebarOffset() + WINDOW_GAP;
  const maxX = Math.max(minX, window.innerWidth - width - WINDOW_GAP);
  const minY = HEADER_OFFSET;
  const maxY = Math.max(minY, window.innerHeight - height - WINDOW_GAP);

  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

/**
 * Pipecat/Daily-powered voice window.
 *
 * Renders a draggable floating panel that embeds the configured voice surface,
 * preserving launch context while staying out of the project-chat control row.
 */
export function VoiceDrawer() {
  const { drawerState, closeVoice } = useVoice();
  const { open, context } = drawerState;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragPointerIdRef = useRef<number | null>(null);

  const panel = getWindowDimensions();
  const panelWidth = panel.width;
  const panelHeight = panel.height;
  const mobileViewport = typeof window !== "undefined" ? isMobileViewport() : false;

  const [position, setPosition] = useState(() => getDefaultPosition());
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const pipecatBaseUrl =
    process.env.NEXT_PUBLIC_PIPECAT_WEBRTC_URL?.trim() || null;

  const fallbackPipecatUrl = useMemo(() => {
    if (!pipecatBaseUrl) return null;
    return buildPipecatLaunchUrl(pipecatBaseUrl, context);
  }, [pipecatBaseUrl, context]);

  useEffect(() => {
    if (!open) return;
    setPosition((current) => clampPosition(current.x, current.y, panelWidth, panelHeight));
  }, [open, panelWidth, panelHeight]);

  useEffect(() => {
    function handleResize() {
      const dims = getWindowDimensions();
      setPosition((current) => clampPosition(current.x, current.y, dims.width, dims.height));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function createVoiceSession() {
      if (!open) return;

      setStatus("loading");
      setErrorMessage(null);

      try {
        const res = await fetch("/api/voice-session", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ context }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.launchUrl) {
          throw new Error(payload?.error || "Voice session launch failed.");
        }

        if (!cancelled) {
          setLaunchUrl(payload.launchUrl);
          setStatus("ready");
        }
      } catch (error: any) {
        if (!cancelled) {
          setLaunchUrl(fallbackPipecatUrl);
          setErrorMessage(error?.message || "Voice session launch failed.");
          setStatus(fallbackPipecatUrl ? "ready" : "error");
        }
      }
    }

    if (open) {
      createVoiceSession();
    } else {
      setLaunchUrl(null);
      setStatus("idle");
      setErrorMessage(null);
      setDragging(false);
      dragPointerIdRef.current = null;
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
    }

    return () => {
      cancelled = true;
    };
  }, [open, context, fallbackPipecatUrl]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (dragPointerIdRef.current === null) return;

      const next = clampPosition(
        event.clientX - dragOffsetRef.current.x,
        event.clientY - dragOffsetRef.current.y,
        panelWidth,
        panelHeight
      );
      setPosition(next);
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragPointerIdRef.current !== event.pointerId) return;
      dragPointerIdRef.current = null;
      setDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [panelWidth, panelHeight]);

  function handleDragStart(event: any) {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    if (mobileViewport) return;

    dragPointerIdRef.current = event.pointerId;
    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    setDragging(true);
  }

  const scopeLabel = context?.scopeLabel ?? context?.source ?? "Voice";
  const title = context?.projectName ?? context?.threadLabel ?? "Atlas Voice";

  return (
    <div
      className={cn(
        "fixed z-[70] flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition-opacity duration-200 ease-out",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        dragging ? "select-none" : undefined
      )}
      style={{
        width: panelWidth,
        height: panelHeight,
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 border-b px-3 py-2.5 flex-shrink-0 bg-background/95 backdrop-blur-sm",
          mobileViewport ? undefined : dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={handleDragStart}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600/10 flex-shrink-0">
          <Mic className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{title}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              {scopeLabel}
            </Badge>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <GripHorizontal className="h-3 w-3" />
              drag
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={closeVoice}
          className="flex-shrink-0"
          title="Close voice window"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {context?.contextSummary && (
        <div className="border-b bg-muted/30 px-3 py-2 flex-shrink-0">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orange-600" />
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {context.contextSummary}
            </p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 bg-background">
        {open && status === "loading" ? (
          <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-center">
            <div className="max-w-[260px] space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-600/10">
                <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
              </div>
              <p className="text-sm font-medium">Starting Atlas voice…</p>
              <p className="text-xs text-muted-foreground">
                Creating an audio-first session.
              </p>
            </div>
          </div>
        ) : launchUrl && open ? (
          <iframe
            ref={iframeRef}
            title="Atlas Voice"
            src={launchUrl}
            className="h-full w-full border-0"
            allow="camera; microphone; autoplay; clipboard-read; clipboard-write"
          />
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-center">
            <div className="max-w-[260px] space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-600/10">
                <Mic className="h-6 w-6 text-orange-600" />
              </div>
              <p className="text-sm font-medium">
                {errorMessage ? "Voice session unavailable" : "Pipecat not configured"}
              </p>
              <p className="text-xs text-muted-foreground">
                {errorMessage ? (
                  errorMessage
                ) : (
                  <>
                    Set <code className="rounded bg-muted px-1 py-0.5 text-[11px]">NEXT_PUBLIC_PIPECAT_WEBRTC_URL</code>{" "}
                    to enable the voice surface.
                  </>
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
