import { create } from 'zustand';

export type TabKey = 'chats' | 'status' | 'communities' | 'profile';

type TabsState = {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
};

export const useTabsStore = create<TabsState>((set) => ({
  activeTab: 'chats',
  setActiveTab: (activeTab) => set({ activeTab }),
}));
