"use client";

import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoice } from "@/components/voice-provider";
import type { VoiceContext } from "@/lib/voice-context";
import { cn } from "@/lib/utils";

interface VoiceMessageActionProps {
  context: VoiceContext;
  className?: string;
  label?: string;
}

export function VoiceMessageAction({
  context,
  className,
  label = "Continue by voice",
}: VoiceMessageActionProps) {
  const { openVoice } = useVoice();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => openVoice(context)}
      className={cn(
        "h-6 px-2 text-xs text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <Mic className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
