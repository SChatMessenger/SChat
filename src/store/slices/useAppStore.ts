import { create } from 'zustand';
import { triggerProfileSync } from '../../services/profileSyncBridge';
import {
  CHAT_FONT_DEFAULT,
  CHAT_FONT_MAX,
  CHAT_FONT_MIN,
  clearProfile,
  DEFAULT_CHAT_SETTINGS,
  DEFAULT_DATA_STORAGE_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_SECURITY_SETTINGS,
  loadProfile,
  migrateChatSettings,
  migrateDataStorageSettings,
  migrateNotificationSettings,
  migratePrivacySettings,
  migrateSecuritySettings,
  saveProfile,
  type AttentionCadence,
  type Audience,
  type BreakthroughContact,
  type AutoDownloadRule,
  type ChatSettings,
  type DataMode,
  type DataStorageSettings,
  type DistanceUnits,
  type LessDataCalls,
  type ListDensity,
  type NotificationSettings,
  type PreciseLocation,
  type PrivacyPersona,
  type PrivacySettings,
  type SecuritySettings,
  type VibePreset,
  type VoiceMode,
} from '../../services/crypto/persist';

export type {
  AttentionCadence,
  Audience,
  AutoDownloadRule,
  BreakthroughContact,
  ChatSettings,
  DataMode,
  DataStorageSettings,
  DistanceUnits,
  LessDataCalls,
  ListDensity,
  NotificationSettings,
  PreciseLocation,
  PrivacyPersona,
  PrivacySettings,
  SecuritySettings,
  VibePreset,
  VoiceMode,
};
export { CHAT_FONT_DEFAULT, CHAT_FONT_MAX, CHAT_FONT_MIN };

export type ThemeOverride = 'system' | 'light' | 'dark';
export type ProfileRoute =
  | 'root'
  | 'account'
  | 'chat-settings'
  | 'privacy-security'
  | 'notifications'
  | 'data-storage'
  | 'region-language';

type AppState = {
  themeOverride: ThemeOverride;
  displayName: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUri: string | null;
  dob: string;
  region: string;
  bio: string;
  preciseLocation: PreciseLocation | null;
  chatSettings: ChatSettings;
  privacy: PrivacySettings;
  security: SecuritySettings;
  notifications: NotificationSettings;
  dataStorage: DataStorageSettings;
  appRegion: string;
  appLanguage: string;
  profileRoute: ProfileRoute;
  hydrated: boolean;
  hydrateProfile: () => Promise<void>;
  resetProfile: () => Promise<void>;
  setThemeOverride: (value: ThemeOverride) => void;
  cycleThemeOverride: () => void;
  setDisplayName: (name: string) => void;
  applySignupProfile: (p: { username: string; firstName: string; lastName: string }) => void;
  applyCloudProfile: (p: {
    username?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    bio?: string;
  }) => void;
  setAvatarUri: (uri: string | null) => void;
  setDob: (dob: string) => void;
  setRegion: (region: string) => void;
  setBio: (bio: string) => void;
  setPreciseLocation: (loc: PreciseLocation | null) => void;
  setChatSetting: <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => void;
  applyVibe: (vibe: VibePreset) => void;
  setPrivacy: <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => void;
  applyPrivacyPersona: (persona: PrivacyPersona) => void;
  setSecurity: <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => void;
  setNotification: <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => void;
  setDataStorage: <K extends keyof DataStorageSettings>(key: K, value: DataStorageSettings[K]) => void;
  setAutoDownload: (net: 'cellular' | 'wifi' | 'roaming', value: AutoDownloadRule) => void;
  applyDataMode: (mode: DataMode) => void;
  setAppRegion: (iso2: string) => void;
  setAppLanguage: (code: string) => void;
  toggleBreakthrough: (contact: BreakthroughContact) => void;
  removeBreakthrough: (id: string) => void;
  addBreakthroughKeyword: (word: string) => void;
  removeBreakthroughKeyword: (word: string) => void;
  openAccount: () => void;
  closeAccount: () => void;
  openChatSettings: () => void;
  openPrivacySecurity: () => void;
  openNotifications: () => void;
  openDataStorage: () => void;
  openRegionLanguage: () => void;
  closeProfileSubScreen: () => void;
};

const order: ThemeOverride[] = ['light', 'dark'];

// Per-network auto-download rules each Data Budget mode maps to. 'custom' is
// produced by hand-editing a rule, never applied as a preset, so it mirrors
// 'balanced' here as a harmless fallback.
function dataModePreset(
  mode: DataMode,
): Pick<DataStorageSettings, 'cellular' | 'wifi' | 'roaming'> {
  switch (mode) {
    case 'saver':
      return {
        cellular: { photos: false, videoMb: 0, filesMb: 0 },
        wifi: { photos: true, videoMb: 10, filesMb: 1 },
        roaming: { photos: false, videoMb: 0, filesMb: 0 },
      };
    case 'unlimited':
      return {
        cellular: { photos: true, videoMb: -1, filesMb: -1 },
        wifi: { photos: true, videoMb: -1, filesMb: -1 },
        roaming: { photos: true, videoMb: 10, filesMb: 1 },
      };
    case 'balanced':
    case 'custom':
    default:
      return {
        cellular: { photos: true, videoMb: 10, filesMb: 1 },
        wifi: { photos: true, videoMb: 15, filesMb: 3 },
        roaming: { photos: true, videoMb: 0, filesMb: 0 },
      };
  }
}

type PersistedFields = Pick<
  AppState,
  | 'themeOverride'
  | 'displayName'
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'avatarUri'
  | 'dob'
  | 'region'
  | 'bio'
  | 'preciseLocation'
  | 'chatSettings'
  | 'privacy'
  | 'security'
  | 'notifications'
  | 'dataStorage'
  | 'appRegion'
  | 'appLanguage'
>;

function snapshot(s: PersistedFields) {
  return {
    themeOverride: s.themeOverride,
    displayName: s.displayName,
    username: s.username,
    firstName: s.firstName,
    lastName: s.lastName,
    avatarUri: s.avatarUri,
    dob: s.dob,
    region: s.region,
    bio: s.bio,
    preciseLocation: s.preciseLocation,
    chatSettings: s.chatSettings,
    privacy: s.privacy,
    security: s.security,
    notifications: s.notifications,
    dataStorage: s.dataStorage,
    appRegion: s.appRegion,
    appLanguage: s.appLanguage,
  };
}

function persist(s: PersistedFields) {
  void saveProfile(snapshot(s)).catch((e) => console.warn('profile persist failed', e));
  // Re-encrypt + upload the profile to the cloud (debounced in the identity
  // store). No-op until signed in. SudoProto 3.0 §0.1.4.
  triggerProfileSync();
}

function privacyPreset(persona: PrivacyPersona): Partial<PrivacySettings> {
  switch (persona) {
    case 'public':
      return {
        profilePhoto: 'everyone', bio: 'everyone', birthday: 'everyone',
        lastSeen: 'everyone', onlineStatus: 'everyone', music: 'everyone',
        gifts: 'everyone', calls: 'everyone', voiceMessages: 'everyone',
        forwards: 'everyone', groupInvites: 'everyone', messages: 'everyone',
      };
    case 'friends':
      return {
        profilePhoto: 'everyone', bio: 'everyone', birthday: 'contacts',
        lastSeen: 'contacts', onlineStatus: 'contacts', music: 'contacts',
        gifts: 'everyone', calls: 'contacts', voiceMessages: 'everyone',
        forwards: 'contacts', groupInvites: 'contacts', messages: 'everyone',
      };
    case 'private':
      return {
        profilePhoto: 'contacts', bio: 'contacts', birthday: 'nobody',
        lastSeen: 'nobody', onlineStatus: 'nobody', music: 'nobody',
        gifts: 'contacts', calls: 'contacts', voiceMessages: 'contacts',
        forwards: 'nobody', groupInvites: 'contacts', messages: 'contacts',
      };
    case 'custom':
      return {};
  }
}

function vibePreset(vibe: VibePreset): Partial<ChatSettings> {
  switch (vibe) {
    case 'casual':
      return { fontSize: 16, wallpaperColor: '#f5f1e8', nameAccentColor: null, listDensity: 'standard', swipeToReply: true };
    case 'pro':
      return { fontSize: 14, wallpaperColor: null, nameAccentColor: '#2563eb', listDensity: 'compact', swipeToReply: true };
    case 'cozy':
      return { fontSize: 18, wallpaperColor: '#e3dcef', nameAccentColor: '#a855f7', listDensity: 'spacious', swipeToReply: true };
    case 'custom':
      return {};
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  themeOverride: 'light',
  displayName: '',
  username: '',
  firstName: '',
  lastName: '',
  avatarUri: null,
  dob: '',
  region: '',
  bio: '',
  preciseLocation: null,
  chatSettings: DEFAULT_CHAT_SETTINGS,
  privacy: DEFAULT_PRIVACY_SETTINGS,
  security: DEFAULT_SECURITY_SETTINGS,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  dataStorage: DEFAULT_DATA_STORAGE_SETTINGS,
  appRegion: 'IN',
  appLanguage: 'en',
  profileRoute: 'root',
  hydrated: false,
  hydrateProfile: async () => {
    if (get().hydrated) return;
    const loaded = await loadProfile();
    if (loaded) {
      set({
        // 'system' was removed as an option — coerce any legacy/invalid stored
        // value to 'light'.
        themeOverride:
          loaded.themeOverride === 'light' || loaded.themeOverride === 'dark'
            ? loaded.themeOverride
            : 'light',
        displayName: loaded.displayName,
        username: loaded.username ?? '',
        firstName: loaded.firstName ?? '',
        lastName: loaded.lastName ?? '',
        avatarUri: loaded.avatarUri,
        dob: loaded.dob,
        region: loaded.region,
        bio: loaded.bio ?? '',
        preciseLocation: loaded.preciseLocation ?? null,
        chatSettings: migrateChatSettings(loaded.chatSettings),
        privacy: migratePrivacySettings(loaded.privacy),
        security: migrateSecuritySettings(loaded.security),
        notifications: migrateNotificationSettings(loaded.notifications),
        dataStorage: migrateDataStorageSettings(loaded.dataStorage),
        appRegion: loaded.appRegion ?? 'IN',
        appLanguage: loaded.appLanguage ?? 'en',
        hydrated: true,
      });
    } else {
      set({ hydrated: true });
    }
  },
  resetProfile: async () => {
    set({
      themeOverride: 'light',
      displayName: '',
      username: '',
      firstName: '',
      lastName: '',
      avatarUri: null,
      dob: '',
      region: '',
      bio: '',
      preciseLocation: null,
      chatSettings: DEFAULT_CHAT_SETTINGS,
      privacy: DEFAULT_PRIVACY_SETTINGS,
      security: DEFAULT_SECURITY_SETTINGS,
      notifications: DEFAULT_NOTIFICATION_SETTINGS,
      dataStorage: DEFAULT_DATA_STORAGE_SETTINGS,
      appRegion: 'IN',
      appLanguage: 'en',
      profileRoute: 'root',
    });
    await clearProfile();
  },
  setThemeOverride: (themeOverride) => {
    set({ themeOverride });
    persist(get());
  },
  cycleThemeOverride: () => {
    set((state) => ({
      themeOverride: order[(order.indexOf(state.themeOverride) + 1) % order.length],
    }));
    persist(get());
  },
  setDisplayName: (displayName) => {
    set({ displayName: displayName.slice(0, 40) });
    persist(get());
  },
  applySignupProfile: ({ username, firstName, lastName }) => {
    const first = firstName.trim().slice(0, 40);
    const last = lastName.trim().slice(0, 40);
    set({
      username: username.trim().slice(0, 32),
      firstName: first,
      lastName: last,
      displayName: [first, last].filter(Boolean).join(' ').slice(0, 40),
    });
    persist(get());
  },
  // Merge a profile decrypted from the cloud (SudoProto 3.0 §0.1.4) — only fields
  // the blob actually carries, so a restore doesn't clobber local edits with blanks.
  applyCloudProfile: (p) => {
    const next: Partial<AppState> = {};
    if (p.username) next.username = p.username.slice(0, 32);
    if (typeof p.firstName === 'string') next.firstName = p.firstName.slice(0, 40);
    if (typeof p.lastName === 'string') next.lastName = p.lastName.slice(0, 40);
    if (p.displayName) next.displayName = p.displayName.slice(0, 40);
    if (typeof p.bio === 'string') next.bio = p.bio.slice(0, 280);
    set(next);
    persist(get());
  },
  setAvatarUri: (avatarUri) => {
    set({ avatarUri });
    persist(get());
  },
  setDob: (dob) => {
    set({ dob: dob.slice(0, 10) });
    persist(get());
  },
  setRegion: (region) => {
    set({ region: region.slice(0, 60) });
    persist(get());
  },
  setBio: (bio) => {
    set({ bio: bio.slice(0, 160) });
    persist(get());
  },
  setPreciseLocation: (preciseLocation) => {
    set({ preciseLocation });
    persist(get());
  },
  setChatSetting: (key, value) => {
    set((s) => ({
      chatSettings: {
        ...s.chatSettings,
        [key]: value,
        ...(key === 'vibe' ? {} : { vibe: 'custom' as const }),
      },
    }));
    persist(get());
  },
  applyVibe: (vibe) => {
    set((s) => ({ chatSettings: { ...s.chatSettings, ...vibePreset(vibe), vibe } }));
    persist(get());
  },
  setPrivacy: (key, value) => {
    set((s) => ({
      privacy: {
        ...s.privacy,
        [key]: value,
        ...(key === 'persona' ? {} : { persona: 'custom' as const }),
      },
    }));
    persist(get());
  },
  applyPrivacyPersona: (persona) => {
    set((s) => ({ privacy: { ...s.privacy, ...privacyPreset(persona), persona } }));
    persist(get());
  },
  setSecurity: (key, value) => {
    set((s) => ({ security: { ...s.security, [key]: value } }));
    persist(get());
  },
  setNotification: (key, value) => {
    set((s) => ({ notifications: { ...s.notifications, [key]: value } }));
    persist(get());
  },
  setDataStorage: (key, value) => {
    set((s) => ({ dataStorage: { ...s.dataStorage, [key]: value } }));
    persist(get());
  },
  setAutoDownload: (net, value) => {
    // Hand-tuning any per-network rule means the preset no longer describes
    // the settings — fall back to 'custom'.
    set((s) => ({ dataStorage: { ...s.dataStorage, [net]: value, mode: 'custom' } }));
    persist(get());
  },
  applyDataMode: (mode) => {
    set((s) => ({ dataStorage: { ...s.dataStorage, ...dataModePreset(mode), mode } }));
    persist(get());
  },
  setAppRegion: (appRegion) => {
    set({ appRegion });
    persist(get());
  },
  setAppLanguage: (appLanguage) => {
    set({ appLanguage });
    persist(get());
  },
  toggleBreakthrough: (contact) => {
    set((s) => {
      const exists = s.notifications.breakthrough.some((c) => c.id === contact.id);
      const breakthrough = exists
        ? s.notifications.breakthrough.filter((c) => c.id !== contact.id)
        : [...s.notifications.breakthrough, contact];
      return { notifications: { ...s.notifications, breakthrough } };
    });
    persist(get());
  },
  removeBreakthrough: (id) => {
    set((s) => ({
      notifications: {
        ...s.notifications,
        breakthrough: s.notifications.breakthrough.filter((c) => c.id !== id),
      },
    }));
    persist(get());
  },
  addBreakthroughKeyword: (word) => {
    const w = word.trim().toLowerCase().slice(0, 24);
    if (!w) return;
    set((s) => {
      if (s.notifications.breakthroughKeywords.includes(w)) return s;
      return {
        notifications: {
          ...s.notifications,
          breakthroughKeywords: [...s.notifications.breakthroughKeywords, w].slice(0, 20),
        },
      };
    });
    persist(get());
  },
  removeBreakthroughKeyword: (word) => {
    set((s) => ({
      notifications: {
        ...s.notifications,
        breakthroughKeywords: s.notifications.breakthroughKeywords.filter((k) => k !== word),
      },
    }));
    persist(get());
  },
  openAccount: () => set({ profileRoute: 'account' }),
  closeAccount: () => set({ profileRoute: 'root' }),
  openChatSettings: () => set({ profileRoute: 'chat-settings' }),
  openPrivacySecurity: () => set({ profileRoute: 'privacy-security' }),
  openNotifications: () => set({ profileRoute: 'notifications' }),
  openDataStorage: () => set({ profileRoute: 'data-storage' }),
  openRegionLanguage: () => set({ profileRoute: 'region-language' }),
  closeProfileSubScreen: () => set({ profileRoute: 'root' }),
}));
