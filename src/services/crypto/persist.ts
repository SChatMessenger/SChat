import * as SecureStore from 'expo-secure-store';
import { deserializeIdentity, serializeIdentity } from './keys';
import { hex, hmacSha512, unhex, utf8Encode } from './primitives';
import type { RatchetState } from './ratchet';
import type { IdentitySecretBundle } from './session';

const KEY_IDENTITY = 'schat.identity.v1';
const KEY_SESSION = 'schat.session.v1';
const KEY_CHATS = 'schat.chats.v1';
const KEY_PROFILE = 'schat.profile.v1';
const KEY_PASSCODE = 'schat.passcode.v1';

export type PersistedProfile = {
  themeOverride: 'system' | 'light' | 'dark';
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
  appRegion: string; // iso2 country code for app locale (e.g. 'IN')
  appLanguage: string; // language code (e.g. 'en', 'hi')
};

export const CHAT_FONT_MIN = 12;
export const CHAT_FONT_MAX = 30;
export const CHAT_FONT_DEFAULT = 16;

export type ListDensity = 'compact' | 'standard' | 'spacious';
export type VoiceMode = 'tap' | 'hold';
export type DistanceUnits = 'km' | 'mi';
export type VibePreset = 'casual' | 'pro' | 'cozy' | 'custom';

export type ChatSettings = {
  vibe: VibePreset;
  // Look
  fontSize: number;
  wallpaperColor: string | null;
  nameAccentColor: string | null;
  // Lists & gestures
  listDensity: ListDensity;
  swipeToReply: boolean;
  // Composer
  enterSends: boolean;
  voiceMode: VoiceMode;
  // Media & system
  pauseMusicOnRecord: boolean;
  inAppBrowser: boolean;
  distanceUnits: DistanceUnits;
  // Privacy in chats
  readReceipts: boolean;
  typingIndicators: boolean;
  adultContent: boolean;
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  vibe: 'custom',
  fontSize: CHAT_FONT_DEFAULT,
  wallpaperColor: null,
  nameAccentColor: null,
  listDensity: 'standard',
  swipeToReply: true,
  enterSends: false,
  voiceMode: 'hold',
  pauseMusicOnRecord: true,
  inAppBrowser: true,
  distanceUnits: 'km',
  readReceipts: true,
  typingIndicators: true,
  adultContent: false,
};

export type Audience = 'everyone' | 'contacts' | 'nobody';
export type PrivacyPersona = 'public' | 'friends' | 'private' | 'custom';

export type PrivacySettings = {
  persona: PrivacyPersona;
  profilePhoto: Audience;
  bio: Audience;
  birthday: Audience;
  lastSeen: Audience;
  onlineStatus: Audience;
  music: Audience;
  gifts: Audience;
  calls: Audience;
  voiceMessages: Audience;
  forwards: Audience;
  groupInvites: Audience;
  messages: Audience;
};

export type SecuritySettings = {
  twoFactor: boolean;
  autoDeleteDays: number;
  // When on, an already-registered account must enter its passcode after OTP to
  // finish signing in (see useIdentityStore). The digits live in their own
  // SecureStore slot (KEY_PASSCODE), never in the profile blob.
  appPasscode: boolean;
  passkeys: boolean;
  blockedCount: number;
  activeDevices: number;
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  persona: 'friends',
  profilePhoto: 'everyone',
  bio: 'everyone',
  birthday: 'contacts',
  lastSeen: 'contacts',
  onlineStatus: 'contacts',
  music: 'contacts',
  gifts: 'everyone',
  calls: 'contacts',
  voiceMessages: 'everyone',
  forwards: 'contacts',
  groupInvites: 'contacts',
  messages: 'everyone',
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  twoFactor: false,
  autoDeleteDays: 0,
  appPasscode: false,
  passkeys: false,
  blockedCount: 0,
  activeDevices: 1,
};

export function migratePrivacySettings(raw: unknown): PrivacySettings {
  return { ...DEFAULT_PRIVACY_SETTINGS, ...(raw as Partial<PrivacySettings> | undefined) };
}

export function migrateSecuritySettings(raw: unknown): SecuritySettings {
  return { ...DEFAULT_SECURITY_SETTINGS, ...(raw as Partial<SecuritySettings> | undefined) };
}

// ── Notifications ────────────────────────────────────────────────────────────
// Original model (not Telegram's mute-by-exception pile of toggles): notify
// by intention. A small Breakthrough list always gets through; everyone else
// is rationed by a single Attention Budget cadence; and the active state can
// switch itself by context (sleep window, calendar, focus) instead of by hand.

// How often non-priority chats are allowed to interrupt. Non-realtime cadences
// batch their pings into one digest delivered at that interval.
export type AttentionCadence = 'realtime' | 'fewMin' | 'hourly' | 'silent';

export type BreakthroughContact = { id: string; name: string };

export type NotificationSettings = {
  // Attention Budget — applies to everyone NOT on the breakthrough list.
  cadence: AttentionCadence;
  // People who always get through, even in sleep / focus.
  breakthrough: BreakthroughContact[];
  // Content-aware breakthrough: messages containing any of these words punch
  // through, even from muted/non-priority chats. Telegram/WhatsApp have nothing
  // like this — they only know people, never what was said.
  breakthroughKeywords: string[];
  // Context auto-switch — the app changes state itself instead of you toggling.
  autoSleep: boolean;
  autoCalendar: boolean;
  autoFocus: boolean;
  sleepStart: string; // "HH:MM", 24h
  sleepEnd: string; // "HH:MM", 24h
  // Per-surface routing — granular sources you can mute independently.
  allAccounts: boolean; // master switch across every signed-in account
  privateChats: boolean;
  groupsPrivate: boolean;
  groupsPublic: boolean;
  channelsPrivate: boolean;
  channelsPublic: boolean;
  stories: boolean;
  reactions: boolean;
  pinnedMessages: boolean;
  // Delivery plumbing.
  sound: boolean;
  vibrate: boolean;
  preview: boolean; // show message text on the lock screen
  chatSound: boolean; // in-chat send/receive sounds
  badge: boolean; // app icon unread count
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  cadence: 'realtime',
  breakthrough: [],
  breakthroughKeywords: [],
  autoSleep: true,
  autoCalendar: false,
  autoFocus: false,
  sleepStart: '23:00',
  sleepEnd: '07:00',
  allAccounts: true,
  privateChats: true,
  groupsPrivate: true,
  groupsPublic: true,
  channelsPrivate: true,
  channelsPublic: false,
  stories: false,
  reactions: true,
  pinnedMessages: true,
  sound: true,
  vibrate: true,
  preview: true,
  chatSound: true,
  badge: true,
};

export function migrateNotificationSettings(raw: unknown): NotificationSettings {
  const merged: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(raw as Partial<NotificationSettings> | undefined),
  };
  if (!Array.isArray(merged.breakthrough)) merged.breakthrough = [];
  if (!Array.isArray(merged.breakthroughKeywords)) merged.breakthroughKeywords = [];
  return merged;
}

// ── Data & Storage ──────────────────────────────────────────────────────────
// "Budgets, not bytes." Instead of Telegram's pile of per-network × per-media
// byte-threshold toggles, the surface is two dials: a Data Budget (one mode
// drives all auto-download + an optional monthly cap that auto-engages Saver)
// and a Storage Autopilot (a size ceiling the app stays under by evicting the
// oldest cached media). The granular controls still exist underneath; touching
// any of them flips the mode to 'custom'.
export type DataMode = 'saver' | 'balanced' | 'unlimited' | 'custom';
export type LessDataCalls = 'never' | 'roaming' | 'always';
// videoMb / filesMb sentinel: -1 means "no size limit" (always auto-download),
// 0 means "off" (never), any positive value is the max size in MB.
export const AUTO_DL_NO_LIMIT = -1;
// Per-network auto-download rule. photos = on/off; videoMb / filesMb are the
// max auto-download size in MB (0 = never auto-download that kind).
export type AutoDownloadRule = {
  photos: boolean;
  videoMb: number;
  filesMb: number;
};

export type DataStorageSettings = {
  mode: DataMode;
  monthlyCapGb: number; // 0 = no cap
  autoSaverNearCap: boolean; // switch to Saver as the cap approaches
  roamingSaver: boolean; // always Saver while roaming
  cellular: AutoDownloadRule;
  wifi: AutoDownloadRule;
  roaming: AutoDownloadRule;
  // Storage Autopilot
  storageCapMb: number; // 0 = off (keep everything)
  keepMediaDays: number; // 0 = forever, else auto-clear cache older than N days
  // Save incoming media to the system gallery, by surface
  saveGalleryPrivate: boolean;
  saveGalleryGroups: boolean;
  saveGalleryChannels: boolean;
  // Delivery / network plumbing
  streamMedia: boolean; // stream video & audio instead of full download
  lessDataCalls: LessDataCalls;
  proxyEnabled: boolean;
};

export const DEFAULT_DATA_STORAGE_SETTINGS: DataStorageSettings = {
  mode: 'balanced',
  monthlyCapGb: 0,
  autoSaverNearCap: true,
  roamingSaver: true,
  cellular: { photos: true, videoMb: 10, filesMb: 1 },
  wifi: { photos: true, videoMb: 15, filesMb: 3 },
  roaming: { photos: true, videoMb: 0, filesMb: 0 },
  storageCapMb: 0,
  keepMediaDays: 0,
  saveGalleryPrivate: false,
  saveGalleryGroups: false,
  saveGalleryChannels: false,
  streamMedia: true,
  lessDataCalls: 'roaming',
  proxyEnabled: false,
};

export function migrateDataStorageSettings(raw: unknown): DataStorageSettings {
  const r = (raw as Partial<DataStorageSettings> | undefined) ?? {};
  const rule = (v: unknown, fb: AutoDownloadRule): AutoDownloadRule => ({
    ...fb,
    ...(v as Partial<AutoDownloadRule> | undefined),
  });
  return {
    ...DEFAULT_DATA_STORAGE_SETTINGS,
    ...r,
    cellular: rule(r.cellular, DEFAULT_DATA_STORAGE_SETTINGS.cellular),
    wifi: rule(r.wifi, DEFAULT_DATA_STORAGE_SETTINGS.wifi),
    roaming: rule(r.roaming, DEFAULT_DATA_STORAGE_SETTINGS.roaming),
  };
}

export function migrateChatSettings(raw: unknown): ChatSettings {
  const merged: ChatSettings = { ...DEFAULT_CHAT_SETTINGS, ...(raw as Partial<ChatSettings> | undefined) };
  const legacy = (raw as { fontScale?: string } | undefined)?.fontScale;
  if (legacy) {
    merged.fontSize =
      legacy === 'small' ? 13 : legacy === 'large' ? 20 : CHAT_FONT_DEFAULT;
  }
  if (typeof merged.fontSize !== 'number') merged.fontSize = CHAT_FONT_DEFAULT;
  merged.fontSize = Math.min(CHAT_FONT_MAX, Math.max(CHAT_FONT_MIN, Math.round(merged.fontSize)));
  return merged;
}

export type PreciseLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  capturedAt: number;
};

export async function loadProfile(): Promise<PersistedProfile | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_PROFILE);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedProfile;
  } catch {
    return null;
  }
}

export async function saveProfile(p: PersistedProfile): Promise<void> {
  await SecureStore.setItemAsync(KEY_PROFILE, JSON.stringify(p));
}

export async function clearProfile(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_PROFILE);
  } catch {
    // ignore
  }
}

// ── App passcode (local sign-in PIN) ─────────────────────────────────────────
// A 4-6 digit code that gates the sign-in of an already-registered account on
// this device. We only ever persist a keyed hash, never the digits, and compare
// hash-to-hash so the raw code never has to be read back.
function hashPasscode(pin: string): string {
  return hex(hmacSha512(utf8Encode('schat.passcode.v1'), utf8Encode(pin)));
}

export async function savePasscode(pin: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_PASSCODE, hashPasscode(pin));
}

export async function hasPasscode(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY_PASSCODE)) != null;
  } catch {
    return false;
  }
}

export async function verifyPasscode(pin: string): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(KEY_PASSCODE);
    return stored != null && stored === hashPasscode(pin);
  } catch {
    return false;
  }
}

export async function clearPasscode(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_PASSCODE);
  } catch {
    // ignore
  }
}

export type PersistedSession = {
  token: string;
  userId: string;
  phone: string;
  inboxId: string;
};

export async function loadIdentity(): Promise<IdentitySecretBundle | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_IDENTITY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return deserializeIdentity(parsed);
  } catch {
    return null;
  }
}

export async function saveIdentity(id: IdentitySecretBundle): Promise<void> {
  const ser = serializeIdentity(id);
  await SecureStore.setItemAsync(KEY_IDENTITY, JSON.stringify(ser));
}

export async function clearIdentity(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_IDENTITY);
  } catch {
    // ignore
  }
}

export async function loadSession(): Promise<PersistedSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_SESSION);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export async function saveSession(s: PersistedSession): Promise<void> {
  await SecureStore.setItemAsync(KEY_SESSION, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_SESSION);
  } catch {
    // ignore
  }
}

export type SerializedRatchet = {
  rootKey: string;
  dhSendKpPub: string;
  dhSendKpSec: string;
  dhRecvPub: string;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  skipped: Array<{ k: string; mk: string; nonce: string }>;
};

export function serializeRatchet(r: RatchetState): SerializedRatchet {
  const skipped: SerializedRatchet['skipped'] = [];
  r.skipped.forEach((slot, k) => {
    skipped.push({ k, mk: hex(slot.mk), nonce: hex(slot.nonce) });
  });
  return {
    rootKey: hex(r.rootKey),
    dhSendKpPub: hex(r.dhSendKp.pub),
    dhSendKpSec: hex(r.dhSendKp.sec),
    dhRecvPub: hex(r.dhRecvPub),
    cks: r.cks ? hex(r.cks) : null,
    ckr: r.ckr ? hex(r.ckr) : null,
    ns: r.ns,
    nr: r.nr,
    pn: r.pn,
    skipped,
  };
}

export function deserializeRatchet(s: SerializedRatchet): RatchetState {
  const skipped = new Map<string, { mk: Uint8Array; nonce: Uint8Array }>();
  for (const e of s.skipped) {
    skipped.set(e.k, { mk: unhex(e.mk), nonce: unhex(e.nonce) });
  }
  return {
    rootKey: unhex(s.rootKey),
    dhSendKp: { pub: unhex(s.dhSendKpPub), sec: unhex(s.dhSendKpSec) },
    dhRecvPub: unhex(s.dhRecvPub),
    cks: s.cks ? unhex(s.cks) : null,
    ckr: s.ckr ? unhex(s.ckr) : null,
    ns: s.ns,
    nr: s.nr,
    pn: s.pn,
    skipped,
  };
}

export type SerializedConversation = {
  id: string;
  name: string;
  phone?: string | null;
  avatarColor: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  peerBundleHex: string | null;
  peerFingerprint: string | null;
  safetyNumber: string | null;
  verified: boolean;
  peerOpkId?: number;
  peerOpkPubHex?: string;
  peerOpkSigHex?: string;
  ratchet: SerializedRatchet | null;
};

export type SerializedChats = {
  conversations: SerializedConversation[];
  messages: Record<
    string,
    { id: string; author: 'me' | 'them'; text: string; sentAt: number }[]
  >;
};

export async function saveChats(payload: SerializedChats): Promise<void> {
  await SecureStore.setItemAsync(KEY_CHATS, JSON.stringify(payload));
}

export async function loadChats(): Promise<SerializedChats | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_CHATS);
    if (!raw) return null;
    return JSON.parse(raw) as SerializedChats;
  } catch {
    return null;
  }
}

export async function clearChats(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_CHATS);
  } catch {
    // ignore
  }
}
