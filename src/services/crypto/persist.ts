import * as SecureStore from 'expo-secure-store';
import { deserializeIdentity, serializeIdentity } from './keys';
import { hex, unhex } from './primitives';
import type { RatchetState } from './ratchet';
import type { IdentitySecretBundle } from './session';

const KEY_IDENTITY = 'schat.identity.v1';
const KEY_SESSION = 'schat.session.v1';
const KEY_CHATS = 'schat.chats.v1';

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
