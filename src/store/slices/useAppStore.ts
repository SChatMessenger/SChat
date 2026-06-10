import { create } from 'zustand';

// useAppStore — profile + app settings + profile-screen navigation.
//
// Rebuilt as a local-state store after the services/ tree was deleted. Settings
// live in memory (and would persist to the sealed vault / relay once those
// endpoints exist — see apiJsonPut TODOs). No protocol crypto here.

export type ThemeOverride = 'light' | 'dark' | 'system';
export type PrivacyPersona = 'open' | 'balanced' | 'private' | 'max';
export type DataMode = 'low' | 'auto' | 'high';
export type LessDataCalls = 'never' | 'cellular' | 'always';
export type DistanceUnits = 'km' | 'mi';
export type ListDensity = 'compact' | 'cozy';
export type VoiceMode = 'off' | 'push' | 'auto';
export type VibePreset = 'calm' | 'standard' | 'lively';
export type AttentionCadence = 'low' | 'normal' | 'high';
export type Audience = 'everyone' | 'contacts' | 'nobody';
export type AutoDownloadRule = { photos: boolean; videoMb: number; filesMb: number };
export type BreakthroughContact = { id: string; name: string };

type ProfileRoute =
  | 'account'
  | 'chat-settings'
  | 'privacy-security'
  | 'notifications'
  | 'data-storage'
  | 'region-language'
  | null;

// Settings objects keep an index signature so the generic `set*(key, value)`
// setters the screens use stay type-clean while still naming the known fields.
export interface PrivacySettings {
  [key: string]: any;
  persona: PrivacyPersona;
  lastSeen: Audience;
  profilePhoto: Audience;
  calls: Audience;
  readReceipts: boolean;
}
export interface SecuritySettings {
  [key: string]: any;
  appPasscode: boolean;
  twoFactor: boolean;
  passkeys: number;
  activeDevices: number;
  blockedCount: number;
  autoDeleteDays: number;
  unverifiedTtlDays: number;
}
export interface NotificationSettings {
  [key: string]: any;
  breakthrough: boolean;
  breakthroughContacts: BreakthroughContact[];
  breakthroughKeywords: string[];
  cadence: AttentionCadence;
  preview: boolean;
}
export interface ChatSettings {
  [key: string]: any;
  fontSize: number;
  density: ListDensity;
  enterToSend: boolean;
}
export interface DataStorage {
  [key: string]: any;
  mode: DataMode;
  lessDataCalls: LessDataCalls;
  autoDownload: Record<string, AutoDownloadRule>;
}

const defaultPrivacy: PrivacySettings = {
  persona: 'balanced',
  lastSeen: 'contacts',
  profilePhoto: 'contacts',
  calls: 'everyone',
  readReceipts: true,
};
const defaultSecurity: SecuritySettings = {
  appPasscode: false,
  twoFactor: false,
  passkeys: 0,
  activeDevices: 1,
  blockedCount: 0,
  autoDeleteDays: 0,
  unverifiedTtlDays: 0,
};
const defaultNotifications: NotificationSettings = {
  breakthrough: false,
  breakthroughContacts: [],
  breakthroughKeywords: [],
  cadence: 'normal',
  preview: true,
};
const defaultChatSettings: ChatSettings = { fontSize: 16, density: 'cozy', enterToSend: false };
const defaultRule: AutoDownloadRule = { photos: true, videoMb: 5, filesMb: 5 };
const defaultDataStorage: DataStorage = {
  mode: 'auto',
  lessDataCalls: 'never',
  autoDownload: { wifi: { ...defaultRule }, cellular: { ...defaultRule }, roaming: { ...defaultRule } },
};

type AppState = {
  hydrated: boolean;
  // profile
  firstName: string;
  displayName: string;
  username: string;
  bio: string;
  avatarUri: string | null;
  dob: string | null;
  // settings
  themeOverride: ThemeOverride;
  privacy: PrivacySettings;
  security: SecuritySettings;
  notifications: NotificationSettings;
  chatSettings: ChatSettings;
  dataStorage: DataStorage;
  preciseLocation: boolean;
  appLanguage: string;
  appRegion: string;
  // profile-screen nav
  profileRoute: ProfileRoute;

  hydrateProfile: () => Promise<void>;
  resetProfile: () => void;

  setDisplayName: (v: string) => void;
  setBio: (v: string) => void;
  setAvatarUri: (v: string | null) => void;
  setDob: (v: string | null) => void;
  setThemeOverride: (v: ThemeOverride) => void;
  setPreciseLocation: (v: boolean) => void;
  setAppLanguage: (v: string) => void;
  setAppRegion: (v: string) => void;

  setPrivacy: (key: string, value: any) => void;
  setSecurity: (key: string, value: any) => void;
  setNotification: (key: string, value: any) => void;
  setChatSetting: (key: string, value: any) => void;
  setDataStorage: (key: string, value: any) => void;
  setAutoDownload: (net: string, rule: AutoDownloadRule) => void;

  applyDataMode: (mode: DataMode) => void;
  applyPrivacyPersona: (persona: PrivacyPersona) => void;
  applyVibe: (preset: VibePreset) => void;

  toggleBreakthrough: () => void;
  addBreakthroughKeyword: (kw: string) => void;
  removeBreakthroughKeyword: (kw: string) => void;
  removeBreakthrough: (id: string) => void;

  openAccount: () => void;
  openChatSettings: () => void;
  openPrivacySecurity: () => void;
  openNotifications: () => void;
  openDataStorage: () => void;
  openRegionLanguage: () => void;
  closeAccount: () => void;
  closeProfileSubScreen: () => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  firstName: '',
  displayName: '',
  username: '',
  bio: '',
  avatarUri: null,
  dob: null,
  themeOverride: 'system',
  privacy: defaultPrivacy,
  security: defaultSecurity,
  notifications: defaultNotifications,
  chatSettings: defaultChatSettings,
  dataStorage: defaultDataStorage,
  preciseLocation: false,
  appLanguage: 'en',
  appRegion: '',
  profileRoute: null,

  // TODO: load the owner-encrypted profile blob + settings from the vault/relay.
  hydrateProfile: async () => set({ hydrated: true }),
  resetProfile: () =>
    set({
      firstName: '',
      displayName: '',
      username: '',
      bio: '',
      avatarUri: null,
      dob: null,
      privacy: defaultPrivacy,
      security: defaultSecurity,
      notifications: defaultNotifications,
      chatSettings: defaultChatSettings,
      dataStorage: defaultDataStorage,
    }),

  setDisplayName: (displayName) => set({ displayName }),
  setBio: (bio) => set({ bio }),
  setAvatarUri: (avatarUri) => set({ avatarUri }),
  setDob: (dob) => set({ dob }),
  setThemeOverride: (themeOverride) => set({ themeOverride }),
  setPreciseLocation: (preciseLocation) => set({ preciseLocation }),
  setAppLanguage: (appLanguage) => set({ appLanguage }),
  setAppRegion: (appRegion) => set({ appRegion }),

  setPrivacy: (key, value) => set((s) => ({ privacy: { ...s.privacy, [key]: value } })),
  setSecurity: (key, value) => set((s) => ({ security: { ...s.security, [key]: value } })),
  setNotification: (key, value) => set((s) => ({ notifications: { ...s.notifications, [key]: value } })),
  setChatSetting: (key, value) => set((s) => ({ chatSettings: { ...s.chatSettings, [key]: value } })),
  setDataStorage: (key, value) => set((s) => ({ dataStorage: { ...s.dataStorage, [key]: value } })),
  setAutoDownload: (net, rule) =>
    set((s) => ({ dataStorage: { ...s.dataStorage, autoDownload: { ...s.dataStorage.autoDownload, [net]: rule } } })),

  applyDataMode: (mode) => set((s) => ({ dataStorage: { ...s.dataStorage, mode } })),
  applyPrivacyPersona: (persona) => set((s) => ({ privacy: { ...s.privacy, persona } })),
  applyVibe: (preset) =>
    set((s) => ({
      notifications: {
        ...s.notifications,
        cadence: preset === 'calm' ? 'low' : preset === 'lively' ? 'high' : 'normal',
      },
    })),

  toggleBreakthrough: () =>
    set((s) => ({ notifications: { ...s.notifications, breakthrough: !s.notifications.breakthrough } })),
  addBreakthroughKeyword: (kw) =>
    set((s) => ({
      notifications: {
        ...s.notifications,
        breakthroughKeywords: Array.from(new Set([...s.notifications.breakthroughKeywords, kw])),
      },
    })),
  removeBreakthroughKeyword: (kw) =>
    set((s) => ({
      notifications: {
        ...s.notifications,
        breakthroughKeywords: s.notifications.breakthroughKeywords.filter((k) => k !== kw),
      },
    })),
  removeBreakthrough: (id) =>
    set((s) => ({
      notifications: {
        ...s.notifications,
        breakthroughContacts: s.notifications.breakthroughContacts.filter((c) => c.id !== id),
      },
    })),

  openAccount: () => set({ profileRoute: 'account' }),
  openChatSettings: () => set({ profileRoute: 'chat-settings' }),
  openPrivacySecurity: () => set({ profileRoute: 'privacy-security' }),
  openNotifications: () => set({ profileRoute: 'notifications' }),
  openDataStorage: () => set({ profileRoute: 'data-storage' }),
  openRegionLanguage: () => set({ profileRoute: 'region-language' }),
  closeAccount: () => set({ profileRoute: null }),
  closeProfileSubScreen: () => set({ profileRoute: null }),
}));
