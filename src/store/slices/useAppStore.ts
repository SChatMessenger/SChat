import { create } from 'zustand';

export type ThemeOverride = 'system' | 'light' | 'dark';

type AppState = {
  themeOverride: ThemeOverride;
  displayName: string;
  setThemeOverride: (value: ThemeOverride) => void;
  cycleThemeOverride: () => void;
  setDisplayName: (name: string) => void;
};

const order: ThemeOverride[] = ['system', 'light', 'dark'];

export const useAppStore = create<AppState>((set) => ({
  themeOverride: 'system',
  displayName: '',
  setThemeOverride: (themeOverride) => set({ themeOverride }),
  cycleThemeOverride: () =>
    set((state) => ({
      themeOverride: order[(order.indexOf(state.themeOverride) + 1) % order.length],
    })),
  setDisplayName: (displayName) => set({ displayName: displayName.slice(0, 40) }),
}));
