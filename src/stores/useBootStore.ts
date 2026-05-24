import { create } from 'zustand';

export const bootPhases = ['identity', 'ready'] as const;

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
  phase: 'identity',
  error: null,
  succeed: () => {
    const { phase } = get();
    const idx = bootPhases.indexOf(phase);
    const next = bootPhases[Math.min(idx + 1, bootPhases.length - 1)];
    set({ phase: next, error: null });
  },
  fail: (message) => set({ error: message }),
  retry: () => set({ error: null }),
  reset: () => set({ phase: 'identity', error: null }),
}));
