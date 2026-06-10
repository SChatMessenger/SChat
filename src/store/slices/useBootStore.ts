import { create } from 'zustand';

// The top-level app gate (App.tsx renderPhase): the auth flow runs in 'identity'
// and the main app in 'ready'. useIdentityStore flips this to 'ready' when login
// completes and back to 'identity' on sign-out / session-expiry.
export type BootPhase = 'identity' | 'ready';

type BootState = {
  phase: BootPhase;
  setPhase: (phase: BootPhase) => void;
  /** Return to the auth gate (sign-out / 401). */
  reset: () => void;
};

export const useBootStore = create<BootState>((set) => ({
  phase: 'identity',
  setPhase: (phase) => set({ phase }),
  reset: () => set({ phase: 'identity' }),
}));
