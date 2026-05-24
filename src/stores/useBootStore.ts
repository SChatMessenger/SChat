import { useEffect } from 'react';
import { create } from 'zustand';

export const bootPhases = [
  'splash',
  'security',
  'identity',
  'keyUnlock',
  'network',
  'inboxSync',
  'ready',
] as const;

export type BootPhase = (typeof bootPhases)[number];

type BootState = {
  phase: BootPhase;
  error: string | null;
  succeed: () => void;
  fail: (message: string) => void;
  retry: () => void;
  reset: () => void;
};

export const useBootStore = create<BootState>((set, get) => ({
  phase: 'splash',
  error: null,
  succeed: () => {
    const { phase } = get();
    const idx = bootPhases.indexOf(phase);
    const next = bootPhases[Math.min(idx + 1, bootPhases.length - 1)];
    set({ phase: next, error: null });
  },
  fail: (message) => set({ error: message }),
  retry: () => set({ error: null }),
  reset: () => set({ phase: 'splash', error: null }),
}));

export function useBootAutoAdvance(delayMs = 800) {
  const succeed = useBootStore((s) => s.succeed);
  const error = useBootStore((s) => s.error);
  useEffect(() => {
    if (error) return;
    const id = setTimeout(succeed, delayMs);
    return () => clearTimeout(id);
  }, [succeed, error, delayMs]);
}
