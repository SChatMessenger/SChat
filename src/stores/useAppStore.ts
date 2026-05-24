import { create } from 'zustand';

export type ThemeOverride = 'system' | 'light' | 'dark';

type AppState = {
  themeOverride: ThemeOverride;
  setThemeOverride: (value: ThemeOverride) => void;
  cycleThemeOverride: () => void;
};

const order: ThemeOverride[] = ['system', 'light', 'dark'];

export const useAppStore = create<AppState>((set) => ({
  themeOverride: 'system',
  setThemeOverride: (themeOverride) => set({ themeOverride }),
  cycleThemeOverride: () =>
    set((state) => ({
      themeOverride: order[(order.indexOf(state.themeOverride) + 1) % order.length],
    })),
}));
