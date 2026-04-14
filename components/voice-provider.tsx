"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { VoiceContext } from "@/lib/voice-context";

interface VoiceDrawerState {
  open: boolean;
  context: VoiceContext | null;
}

interface VoiceProviderValue {
  drawerState: VoiceDrawerState;
  openVoice: (context: VoiceContext) => void;
  closeVoice: () => void;
}

const VoiceCtx = createContext<VoiceProviderValue | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [drawerState, setDrawerState] = useState<VoiceDrawerState>({
    open: false,
    context: null,
  });

  const openVoice = useCallback((context: VoiceContext) => {
    setDrawerState({ open: true, context });
  }, []);

  const closeVoice = useCallback(() => {
    setDrawerState({ open: false, context: null });
  }, []);

  return (
    <VoiceCtx.Provider value={{ drawerState, openVoice, closeVoice }}>
      {children}
    </VoiceCtx.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceCtx);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}
