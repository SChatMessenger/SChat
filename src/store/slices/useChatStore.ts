import { create } from 'zustand';
import { ApiError, apiBinaryRequest, apiJsonPost, apiLongPoll } from '../../services/api/client';
import { getStateBlob, putStateBlob, usernameResolveRaw } from '../../services/api/profile';
import { decryptChatState, encryptChatState } from '../../services/crypto/chatState';
import {
  BUNDLE_BYTES,
  deserializeBundle,
  deserializePeer,
  identityFingerprint,
  peerIdentityOf,
  safetyNumberBetween,
  serializePeer,
  verifyBundleSignature,
  type IdentityPublicBundle,
  type PeerIdentity,
} from '../../services/crypto/keys';
import {
  X25519_KEY_BYTES,
  bytesEqual,
  hex,
  unhex,
  utf8Decode,
  utf8Encode,
} from '../../services/crypto/primitives';
import {
  deserializeRatchet,
  loadChats,
  saveChats,
  serializeRatchet,
  type SerializedChats,
  type SerializedConversation,
} from '../../services/crypto/persist';
import {
  FRAME_RATCHET,
  openNext,
  peekVersion,
  sealNext,
  type RatchetState,
} from '../../services/crypto/ratchet';
import {
  FRAME_AKE_INIT,
  FRAME_AKE_RESP,
  akeFinish,
  akeInit,
  akeRespond,
  deserializeAkePending,
  serializeAkePending,
  type AkePending,
} from '../../services/crypto/ake';
import { useIdentityStore } from './useIdentityStore';

export type Conversation = {
  id: string;
  name: string;
  phone?: string | null;
  avatarColor: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  peer: PeerIdentity | null;
  peerFingerprint: string | null;
  safetyNumber: string | null;
  verified: boolean;
  ratchet: RatchetState | null;
  // Live-AKE: a handshake we initiated and are waiting on the AKE_RESP for, plus
  // any plaintext typed while it completes (SudoProto §0.1.7 first-contact RT).
  pendingAke: AkePending | null;
  outbox: string[];
  // Last time we peeked the peer's published identity for session self-heal
  // (in-memory only; resets on reload so we re-check once after restart).
  lastKeyCheckAt?: number;
};

export type Message = {
  id: string;
  author: 'me' | 'them';
  // Sender's inbox id. Alignment is decided by comparing this to the signed-in
  // account's inbox (identity-anchored) rather than trusting `author`, which is
  // only relative to whoever stored the message.
  from?: string;
  text: string;
  sentAt: number;
};

type ChatState = {
  conversations: Conversation[];
  messagesByConversationId: Record<string, Message[]>;
  activeConversationId: string | null;
  chatProfileOpen: boolean;
  activeCall: 'voice' | 'video' | 'meet' | null;
  composing: boolean;
  lookupPending: boolean;
  lookupError: string | null;
  sendPending: boolean;
  sendError: string | null;
  inboxPending: boolean;
  hydrated: boolean;
  // Which account's chats are currently loaded in memory (its inbox_id), so a
  // change of signed-in account triggers a reload instead of showing stale data.
  loadedAccountId: string | null;
  // On-screen diagnostic of the last send / inbox poll, surfaced in the Chats
  // list so delivery problems are visible without a console. Debug aid.
  debugStatus: string;
  openConversation: (id: string) => void;
  closeConversation: () => void;
  openChatProfile: () => void;
  closeChatProfile: () => void;
  startCall: (type: 'voice' | 'video' | 'meet') => void;
  endCall: () => void;
  sendMessage: (text: string) => Promise<void>;
  openCompose: () => void;
  closeCompose: () => void;
  findContact: (phone: string) => Promise<void>;
  findByUsername: (username: string) => Promise<void>;
  fetchInbox: () => Promise<void>;
  startInboxStream: () => void;
  stopInboxStream: () => void;
  hydrateChats: () => Promise<void>;
  flushChatState: () => void;
  setConversationVerified: (id: string, verified: boolean) => void;
  editContact: (id: string, name: string, phone: string) => void;
  deleteConversation: (id: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
};

const MIN = 60 * 1000;
const HR = 60 * MIN;
const DAY = 24 * HR;

const AVATAR_PALETTE = [
  '#2563eb',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
];

function pickAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function normalizedPhoneDigits(phone: string) {
  return phone.replace(/[^\d]/g, '');
}

function isValidPhone(phone: string) {
  const digits = normalizedPhoneDigits(phone);
  return digits.length >= 8 && digits.length <= 15;
}

function formatPhoneForLookup(typed: string, myDialCode: string): string {
  const trimmed = typed.trim();
  if (trimmed.startsWith('+')) return '+' + normalizedPhoneDigits(trimmed);
  return `${myDialCode}${normalizedPhoneDigits(trimmed)}`;
}

// Re-resolve a peer by their INBOX-ID — the stable handle every conversation
// already holds (conversation.id). Decouples recovery from phone/@username
// entirely: works however the chat was started. Returns the peer's current
// identity core (idX ‖ idEd) after verifying the directory self-signature. Under
// 3.0 there is no OPK to claim, so this is a plain read used both for the cheap
// self-heal key-change check and to refresh keys before re-running the live AKE.
async function resolvePeerByInbox(inboxId: string): Promise<PeerIdentity | null> {
  const token = useIdentityStore.getState().token;
  if (!token || !inboxId) return null;
  try {
    const bytes = await apiBinaryRequest(
      'GET',
      `/users/lookup-by-inbox?inbox=${encodeURIComponent(inboxId)}`,
      undefined,
      token,
    );
    const parsed = parseLookupResponse(bytes);
    if (!parsed || !verifyBundleSignature(parsed.bundle)) return null;
    return peerIdentityOf(parsed.bundle);
  } catch {
    return null;
  }
}

// How often (at most) the sender re-checks a peer's identity before sending into
// an existing session.
const KEY_CHECK_INTERVAL_MS = 60_000;

function readU8(buf: Uint8Array, off: number): { value: number; next: number } {
  return { value: buf[off], next: off + 1 };
}

function readU16LE(buf: Uint8Array, off: number): { value: number; next: number } {
  return { value: buf[off] | (buf[off + 1] << 8), next: off + 2 };
}

function readU32LE(buf: Uint8Array, off: number): { value: number; next: number } {
  return {
    value:
      (buf[off] |
        (buf[off + 1] << 8) |
        (buf[off + 2] << 16) |
        (buf[off + 3] << 24)) >>>
      0,
    next: off + 4,
  };
}

function readI64LE(buf: Uint8Array, off: number): { value: number; next: number } {
  const lo =
    (buf[off] |
      (buf[off + 1] << 8) |
      (buf[off + 2] << 16) |
      (buf[off + 3] << 24)) >>>
    0;
  const hi =
    (buf[off + 4] |
      (buf[off + 5] << 8) |
      (buf[off + 6] << 16) |
      (buf[off + 7] << 24)) >>>
    0;
  const value = hi * 0x100000000 + lo;
  return { value, next: off + 8 };
}

// Directory resolver wire format (3.0): LE16(inboxLen) ‖ inbox ‖ bundle(128).
// No one-time-prekey trailer — the initiator brings its own ephemerals to the AKE.
function parseLookupResponse(
  bytes: Uint8Array,
): { inboxId: string; bundle: IdentityPublicBundle } | null {
  let off = 0;
  const a = readU16LE(bytes, off);
  off = a.next;
  const inboxId = utf8Decode(bytes.subarray(off, off + a.value));
  off += a.value;
  const bundleBytes = bytes.subarray(off, off + BUNDLE_BYTES);
  if (bundleBytes.length !== BUNDLE_BYTES) return null;
  const bundle = deserializeBundle(new Uint8Array(bundleBytes));
  if (!bundle) return null;
  return { inboxId, bundle };
}

type WireMessage = {
  id: string;
  createdAtMs: number;
  frame: Uint8Array;
};

function parseInboxStream(bytes: Uint8Array): WireMessage[] {
  let off = 0;
  const c = readU32LE(bytes, off);
  off = c.next;
  const out: WireMessage[] = [];
  for (let i = 0; i < c.value; i++) {
    const idLen = readU8(bytes, off);
    off = idLen.next;
    const idBytes = bytes.subarray(off, off + idLen.value);
    off += idLen.value;
    const ts = readI64LE(bytes, off);
    off = ts.next;
    const fl = readU32LE(bytes, off);
    off = fl.next;
    const frame = new Uint8Array(bytes.subarray(off, off + fl.value));
    off += fl.value;
    out.push({ id: hex(idBytes), createdAtMs: ts.value, frame });
  }
  return out;
}

function snapshot(
  conversations: Conversation[],
  messagesByConversationId: Record<string, Message[]>,
): SerializedChats {
  return {
    conversations: conversations.map<SerializedConversation>((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      avatarColor: c.avatarColor,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      peerBundleHex: c.peer ? hex(serializePeer(c.peer)) : null,
      peerFingerprint: c.peerFingerprint,
      safetyNumber: c.safetyNumber,
      verified: c.verified,
      pendingAke: c.pendingAke ? serializeAkePending(c.pendingAke) : null,
      outbox: c.outbox.length ? c.outbox : undefined,
      ratchet: c.ratchet ? serializeRatchet(c.ratchet) : null,
    })),
    messages: messagesByConversationId,
  };
}

// Ratchet message envelope. After the live AKE the handshake carried no payload,
// so the initiator's FIRST real message also carries its phone (for the chat
// title) — the responder created the conversation from the AKE_INIT and only
// knows the sender's inbox until now. A 1-byte tag keeps every later message a
// plain text body:
//   tag 0x00:  [0x00] message-utf8
//   tag 0x01:  [0x01][phoneLen u16][phone] message-utf8
function encodeRatchetText(text: string, phone?: string): Uint8Array {
  const msg = utf8Encode(text);
  if (phone === undefined) return concatBytes(new Uint8Array([0x00]), msg);
  const ph = utf8Encode(phone);
  const out = new Uint8Array(1 + 2 + ph.length + msg.length);
  out[0] = 0x01;
  out[1] = ph.length & 0xff;
  out[2] = (ph.length >>> 8) & 0xff;
  out.set(ph, 3);
  out.set(msg, 3 + ph.length);
  return out;
}

function decodeRatchetText(buf: Uint8Array): { text: string; phone?: string } | null {
  if (buf.length < 1) return null;
  const tag = buf[0];
  if (tag === 0x00) return { text: utf8Decode(buf.subarray(1)) };
  if (tag === 0x01) {
    if (buf.length < 3) return null;
    const phoneLen = buf[1] | (buf[2] << 8);
    if (3 + phoneLen > buf.length) return null;
    const phone = utf8Decode(buf.subarray(3, 3 + phoneLen));
    const text = utf8Decode(buf.subarray(3 + phoneLen));
    return { text, phone };
  }
  return null;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

let stateSyncTimer: ReturnType<typeof setTimeout> | null = null;
let inboxStreamRunning = false;

// Debounced upload of the encrypted chat state to the cloud — the system of
// record (SudoProto 3.0 §0.1.4). The local SecureStore write in `persist` is a
// write-through cache for offline use and crash safety; the cloud is what makes
// chats restore on a fresh device and not be local-only.
function uploadChatState(snap: SerializedChats) {
  if (stateSyncTimer) clearTimeout(stateSyncTimer);
  stateSyncTimer = setTimeout(() => {
    const identity = useIdentityStore.getState().identity;
    if (!identity) return;
    try {
      void putStateBlob(encryptChatState(identity, snap)).catch((e) =>
        console.warn('chat cloud sync failed', e),
      );
    } catch (e) {
      console.warn('chat encrypt failed', e);
    }
  }, 1500);
}

function persist(state: { conversations: Conversation[]; messagesByConversationId: Record<string, Message[]> }) {
  const accountId = useIdentityStore.getState().inboxId;
  if (!accountId) return; // no signed-in account → nothing to persist
  const snap = snapshot(state.conversations, state.messagesByConversationId);
  // Local-first (offline-readable, like WhatsApp/Telegram): write the on-device
  // cache (encrypted at rest by the OS keystore) immediately, AND back up to the
  // encrypted cloud blob for cross-device restore (debounced). SudoProto §0.1.4.
  void saveChats(accountId, snap).catch((e) => console.warn('chat persist failed', e));
  uploadChatState(snap);
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messagesByConversationId: {},
  activeConversationId: null,
  chatProfileOpen: false,
  activeCall: null,
  composing: false,
  lookupPending: false,
  lookupError: null,
  sendPending: false,
  sendError: null,
  inboxPending: false,
  hydrated: false,
  loadedAccountId: null,
  debugStatus: '',
  hydrateChats: async () => {
    // Make sure we know who's signed in before choosing a storage slot.
    await useIdentityStore.getState().hydrateFromStorage();
    const myInbox = useIdentityStore.getState().inboxId;

    // Already showing the right account's chats — nothing to do.
    if (get().hydrated && get().loadedAccountId === (myInbox ?? null)) return;

    // No signed-in account (e.g. just signed out): clear memory, stay loaded.
    if (!myInbox) {
      set({
        conversations: [],
        messagesByConversationId: {},
        activeConversationId: null,
        loadedAccountId: null,
        hydrated: true,
      });
      return;
    }

    // Local-first so chats are available OFFLINE (like WhatsApp/Telegram): read
    // the on-device cache instantly; only when there's no local copy (a fresh or
    // reinstalled device) do we restore from the encrypted cloud blob.
    let loaded: SerializedChats | null = await loadChats(myInbox);
    if (!loaded) {
      const myIdentity = useIdentityStore.getState().identity;
      if (myIdentity) {
        try {
          const blob = await getStateBlob();
          if (blob && blob.length > 0) loaded = decryptChatState(myIdentity, blob);
        } catch (e) {
          console.warn('chat cloud restore failed', e);
        }
      }
    }
    if (!loaded) {
      set({
        conversations: [],
        messagesByConversationId: {},
        activeConversationId: null,
        loadedAccountId: myInbox,
        hydrated: true,
      });
      return;
    }
    const filtered = loaded.conversations.filter((c) => c.id !== myInbox);
    const filteredMessages: Record<string, Message[]> = {};
    for (const c of filtered) {
      if (loaded.messages?.[c.id]) filteredMessages[c.id] = loaded.messages[c.id];
    }
    const conversations: Conversation[] = filtered.map((c) => {
      const peer = c.peerBundleHex ? deserializePeer(unhex(c.peerBundleHex)) : null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone ?? null,
        avatarColor: c.avatarColor,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount,
        peer,
        peerFingerprint: c.peerFingerprint,
        safetyNumber: c.safetyNumber,
        verified: !!c.verified,
        pendingAke: c.pendingAke ? deserializeAkePending(c.pendingAke) : null,
        outbox: c.outbox ?? [],
        ratchet: c.ratchet ? deserializeRatchet(c.ratchet) : null,
      };
    });
    set({
      conversations,
      messagesByConversationId: filteredMessages,
      loadedAccountId: myInbox,
      hydrated: true,
    });
    if (filtered.length !== loaded.conversations.length) {
      persist({ conversations, messagesByConversationId: filteredMessages });
    }
  },
  // Immediate (non-debounced) cloud upload — called on app background so the
  // RAM-only chat state isn't lost when the app is closed (no local cache).
  flushChatState: () => {
    const identity = useIdentityStore.getState().identity;
    if (!identity) return;
    if (stateSyncTimer) {
      clearTimeout(stateSyncTimer);
      stateSyncTimer = null;
    }
    const { conversations, messagesByConversationId } = get();
    try {
      void putStateBlob(
        encryptChatState(identity, snapshot(conversations, messagesByConversationId)),
      ).catch((e) => console.warn('chat flush failed', e));
    } catch (e) {
      console.warn('chat flush encrypt failed', e);
    }
  },
  startInboxStream: () => {
    if (inboxStreamRunning) return;
    inboxStreamRunning = true;
    void (async () => {
      // Long-poll loop: each iteration parks on the server until a message lands
      // (or ~25s), then fetches and re-parks — near-instant push delivery with no
      // WebSocket. Idle (1s sleep) until signed in; self-heals on errors.
      while (inboxStreamRunning) {
        const { token } = useIdentityStore.getState();
        if (!token) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        try {
          await apiLongPoll('/messages/wait', 30000);
          if (!inboxStreamRunning) break;
          await get().fetchInbox();
        } catch {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
  },
  stopInboxStream: () => {
    inboxStreamRunning = false;
  },
  setConversationVerified: (id, verified) => {
    const { conversations, messagesByConversationId } = get();
    const next = conversations.map((c) => (c.id === id ? { ...c, verified } : c));
    set({ conversations: next });
    persist({ conversations: next, messagesByConversationId });
  },
  editContact: (id, name, phone) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedPhone = phone.trim();
    const { conversations, messagesByConversationId } = get();
    const next = conversations.map((c) =>
      c.id === id ? { ...c, name: trimmedName, phone: trimmedPhone || null } : c,
    );
    set({ conversations: next });
    persist({ conversations: next, messagesByConversationId });
  },
  deleteConversation: (id) => {
    const { conversations, messagesByConversationId, activeConversationId } = get();
    const nextConvs = conversations.filter((c) => c.id !== id);
    const nextMsgs = { ...messagesByConversationId };
    delete nextMsgs[id];
    set({
      conversations: nextConvs,
      messagesByConversationId: nextMsgs,
      activeConversationId: activeConversationId === id ? null : activeConversationId,
      chatProfileOpen: activeConversationId === id ? false : get().chatProfileOpen,
      activeCall: activeConversationId === id ? null : get().activeCall,
    });
    persist({ conversations: nextConvs, messagesByConversationId: nextMsgs });
  },
  deleteMessage: (conversationId, messageId) => {
    const { conversations, messagesByConversationId } = get();
    const bucket = messagesByConversationId[conversationId];
    if (!bucket) return;
    const nextBucket = bucket.filter((m) => m.id !== messageId);
    if (nextBucket.length === bucket.length) return;
    const nextMsgs = { ...messagesByConversationId, [conversationId]: nextBucket };
    const last = nextBucket[nextBucket.length - 1];
    const nextConvs = conversations.map((c) =>
      c.id === conversationId
        ? {
            ...c,
            lastMessage: last ? last.text : '',
            lastMessageAt: last ? last.sentAt : c.lastMessageAt,
          }
        : c,
    );
    set({ conversations: nextConvs, messagesByConversationId: nextMsgs });
    persist({ conversations: nextConvs, messagesByConversationId: nextMsgs });
  },
  openConversation: (id) => {
    set((s) => ({
      activeConversationId: id,
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, unreadCount: 0 } : c,
      ),
    }));
    void get().fetchInbox();
  },
  closeConversation: () =>
    set({ activeConversationId: null, chatProfileOpen: false, activeCall: null }),
  openChatProfile: () => set({ chatProfileOpen: true }),
  closeChatProfile: () => set({ chatProfileOpen: false }),
  startCall: (type) => set({ activeCall: type }),
  endCall: () => set({ activeCall: null }),
  openCompose: () => set({ composing: true, lookupError: null }),
  closeCompose: () => set({ composing: false, lookupError: null, lookupPending: false }),
  findContact: async (phone) => {
    const { lookupPending } = get();
    if (lookupPending) return;
    const trimmed = phone.trim();
    if (!isValidPhone(trimmed)) {
      set({ lookupError: 'Enter a valid phone number.' });
      return;
    }
    const idState = useIdentityStore.getState();
    const token = idState.token;
    if (!token) {
      set({ lookupError: 'Not signed in.' });
      return;
    }
    const myFullPhone = idState.phone
      ? `${idState.dialCode}${idState.phone.replace(/\D/g, '')}`
      : null;
    const lookupFull = formatPhoneForLookup(trimmed, idState.dialCode);
    if (myFullPhone && lookupFull === myFullPhone) {
      set({ lookupError: "You can't message yourself." });
      return;
    }
    set({ lookupPending: true, lookupError: null });
    try {
      const query = encodeURIComponent(lookupFull);
      const bytes = await apiBinaryRequest(
        'GET',
        `/users/lookup?phone=${query}`,
        undefined,
        token,
      );
      const parsed = parseLookupResponse(bytes);
      if (!parsed) {
        set({ lookupPending: false, lookupError: 'Malformed peer bundle.' });
        return;
      }
      if (!verifyBundleSignature(parsed.bundle)) {
        set({ lookupPending: false, lookupError: 'Peer bundle signature invalid — possible MITM.' });
        return;
      }
      const { inboxId } = parsed;
      const peer = peerIdentityOf(parsed.bundle);

      const myInbox = useIdentityStore.getState().inboxId;
      if (myInbox && inboxId === myInbox) {
        set({ lookupPending: false, lookupError: "That's your own number." });
        return;
      }

      const myIdentity = useIdentityStore.getState().identity;
      const myPeer = myIdentity ? peerIdentityOf(myIdentity) : null;

      const { conversations, messagesByConversationId } = get();
      if (!conversations.some((c) => c.id === inboxId)) {
        const newConv: Conversation = {
          id: inboxId,
          name: trimmed,
          // Keep the looked-up number so a self-heal can refresh the peer's keys
          // and re-run the live AKE if they reinstall (no orphaned ratchet now).
          phone: lookupFull,
          avatarColor: pickAvatarColor(inboxId),
          lastMessage: '',
          lastMessageAt: Date.now(),
          unreadCount: 0,
          peer,
          peerFingerprint: identityFingerprint(peer),
          safetyNumber: myPeer ? safetyNumberBetween(myPeer, peer) : null,
          verified: false,
          pendingAke: null,
          outbox: [],
          ratchet: null,
        };
        const nextConvs = [...conversations, newConv];
        const nextMsgs = { ...messagesByConversationId, [inboxId]: [] };
        set({ conversations: nextConvs, messagesByConversationId: nextMsgs });
        persist({ conversations: nextConvs, messagesByConversationId: nextMsgs });
      }
      set({
        lookupPending: false,
        composing: false,
        activeConversationId: inboxId,
      });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 400
            ? 'No user found.'
            : e.message
          : 'Lookup failed. Check connection.';
      set({ lookupPending: false, lookupError: msg });
    }
  },
  findByUsername: async (raw) => {
    const { lookupPending } = get();
    if (lookupPending) return;
    const u = raw.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._+-]{5,32}$/.test(u)) {
      set({ lookupError: 'Enter a valid @username.' });
      return;
    }
    const token = useIdentityStore.getState().token;
    if (!token) {
      set({ lookupError: 'Not signed in.' });
      return;
    }
    set({ lookupPending: true, lookupError: null });
    try {
      const bytes = await usernameResolveRaw(u);
      const parsed = parseLookupResponse(bytes);
      if (!parsed) {
        set({ lookupPending: false, lookupError: 'Malformed peer bundle.' });
        return;
      }
      if (!verifyBundleSignature(parsed.bundle)) {
        set({ lookupPending: false, lookupError: 'Peer bundle signature invalid — possible MITM.' });
        return;
      }
      const { inboxId } = parsed;
      const peer = peerIdentityOf(parsed.bundle);
      const myInbox = useIdentityStore.getState().inboxId;
      if (myInbox && inboxId === myInbox) {
        set({ lookupPending: false, lookupError: "That's you." });
        return;
      }
      const myIdentity = useIdentityStore.getState().identity;
      const myPeer = myIdentity ? peerIdentityOf(myIdentity) : null;
      const { conversations, messagesByConversationId } = get();
      if (!conversations.some((c) => c.id === inboxId)) {
        const newConv: Conversation = {
          id: inboxId,
          name: `@${u}`,
          avatarColor: pickAvatarColor(inboxId),
          lastMessage: '',
          lastMessageAt: Date.now(),
          unreadCount: 0,
          peer,
          peerFingerprint: identityFingerprint(peer),
          safetyNumber: myPeer ? safetyNumberBetween(myPeer, peer) : null,
          verified: false,
          pendingAke: null,
          outbox: [],
          ratchet: null,
        };
        const nextConvs = [...conversations, newConv];
        const nextMsgs = { ...messagesByConversationId, [inboxId]: [] };
        set({ conversations: nextConvs, messagesByConversationId: nextMsgs });
        persist({ conversations: nextConvs, messagesByConversationId: nextMsgs });
      }
      set({ lookupPending: false, composing: false, activeConversationId: inboxId });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 400
            ? 'No user with that @username.'
            : e.message
          : 'Lookup failed. Check connection.';
      set({ lookupPending: false, lookupError: msg });
    }
  },
  sendMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { activeConversationId, messagesByConversationId, conversations, sendPending } = get();
    if (sendPending || !activeConversationId) return;
    const conversation = conversations.find((c) => c.id === activeConversationId);
    if (!conversation || !conversation.peer) {
      set({ sendError: 'Recipient has no keys yet.' });
      return;
    }
    const { token, identity, inboxId: myInbox, phone: myPhone } = useIdentityStore.getState();
    if (!token || !identity) {
      set({ sendError: 'Not signed in.' });
      return;
    }

    const now = Date.now();
    let peer = conversation.peer;
    let ratchet = conversation.ratchet;
    let keyCheckedAt = conversation.lastKeyCheckAt;

    // Session self-heal: before sending into an existing ratchet, cheaply re-check
    // the peer's published identity (throttled). If idX changed they reinstalled —
    // drop the stale ratchet so we re-run the live AKE against their fresh keys.
    if (
      ratchet &&
      (!conversation.lastKeyCheckAt || now - conversation.lastKeyCheckAt > KEY_CHECK_INTERVAL_MS)
    ) {
      keyCheckedAt = now;
      const current = await resolvePeerByInbox(conversation.id);
      if (current && !bytesEqual(current.x25519Pub, peer.x25519Pub)) {
        peer = current; // adopt the reinstalled identity
        ratchet = null; // force a fresh live AKE
      }
    }

    const sentAt = now;
    const localId = `local-${sentAt}-${Math.random().toString(36).slice(2, 10)}`;
    const optimistic: Message = {
      id: localId,
      author: 'me',
      from: myInbox ?? undefined,
      text: trimmed,
      sentAt,
    };

    // Three paths: (1) established ratchet → send now; (2) handshake already in
    // flight → just queue; (3) no session → start the live AKE and queue. Queued
    // text flushes the moment the AKE_RESP lands (fetchInbox), SudoProto §0.1.7.
    const outFrames: Uint8Array[] = [];
    let nextRatchet = ratchet;
    let nextPending = conversation.pendingAke;
    let nextOutbox = conversation.outbox;
    let mode: string;

    if (ratchet) {
      outFrames.push(sealNext(ratchet, encodeRatchetText(trimmed), identity));
      nextRatchet = ratchet;
      mode = 'ratchet';
    } else if (conversation.pendingAke) {
      nextOutbox = [...conversation.outbox, trimmed];
      mode = 'queued';
    } else {
      const { frame, pending } = akeInit(peer, identity, myInbox ?? '');
      outFrames.push(frame);
      nextPending = pending;
      nextOutbox = [...conversation.outbox, trimmed];
      mode = 'ake-init';
    }

    const nextMsgs = {
      ...messagesByConversationId,
      [activeConversationId]: [
        ...(messagesByConversationId[activeConversationId] ?? []),
        optimistic,
      ],
    };
    const nextConvs = conversations.map((c) =>
      c.id === activeConversationId
        ? {
            ...c,
            peer,
            lastMessage: trimmed,
            lastMessageAt: sentAt,
            ratchet: nextRatchet,
            pendingAke: nextPending,
            outbox: nextOutbox,
            lastKeyCheckAt: keyCheckedAt,
          }
        : c,
    );
    set({
      sendPending: true,
      sendError: null,
      messagesByConversationId: nextMsgs,
      conversations: nextConvs,
    });
    persist({ conversations: nextConvs, messagesByConversationId: nextMsgs });

    try {
      for (const f of outFrames) {
        await apiBinaryRequest('POST', '/messages', f, token, { 'X-Inbox-Id': conversation.id });
      }
      set({
        sendPending: false,
        debugStatus: `${mode} → ${conversation.id.slice(0, 8)}`,
      });
    } catch (e) {
      console.warn('[send] failed', e);
      const msg = e instanceof ApiError ? e.message : 'Send failed.';
      set({ sendPending: false, sendError: msg, debugStatus: `send fail: ${msg}` });
    }
  },
  fetchInbox: async () => {
    const { inboxPending } = get();
    if (inboxPending) return;
    const { token, identity, userId, phone: myPhone } = useIdentityStore.getState();
    if (!token || !identity || !userId) return;
    set({ inboxPending: true });
    try {
      const bytes = await apiBinaryRequest('GET', '/messages?limit=200', undefined, token);
      const rows = parseInboxStream(bytes);
      // Server returns newest-first; process oldest-first so a bootstrap is
      // handled before the ratchet replies that depend on its conversation.
      rows.sort((a, b) => a.createdAtMs - b.createdAtMs);
      console.log('[inbox] fetched', rows.length, 'rows for user', userId);
      let { conversations, messagesByConversationId } = get();
      const nextBuckets: Record<string, Message[]> = { ...messagesByConversationId };
      let conversationsMutated = false;

      // The server keeps delivered messages, so each poll re-returns them. Skip
      // any we've already stored — re-decrypting a consumed bootstrap would just
      // fail (its one-time prekey is gone) and burn cycles.
      const delivered = new Set<string>();
      for (const msgs of Object.values(nextBuckets)) {
        for (const m of msgs) delivered.add(m.id);
      }

      // On-screen diagnostics for this poll.
      let rxNew = 0;
      let rxMsg = 0;
      let rxDrop = 0;
      let lastDrop = '';
      // Server-side cleanup: ids to delete from the inbox after we've handled them.
      const ackIds: string[] = [];
      // Outbound frames produced while handling this batch — AKE_RESP replies and
      // the queued first messages we flush right after completing a handshake.
      // Sent after the loop so state is committed first.
      const toSend: { frame: Uint8Array; inbox: string }[] = [];
      const myPeer = peerIdentityOf(identity);

      for (const row of rows) {
        if (delivered.has(`wire-${row.id}`)) {
          ackIds.push(row.id);
          continue;
        }
        const v = peekVersion(row.frame);
        if (v === FRAME_AKE_INIT) {
          // A peer is opening a live session with us. Verify σ_A, derive RK, stand
          // up the responder ratchet, and reply with AKE_RESP.
          const res = akeRespond(row.frame, identity);
          if (!res) {
            rxDrop++;
            lastDrop = 'ake-init verify';
            ackIds.push(row.id);
            continue;
          }
          // Match by the sender's reply inbox or by their identity key; otherwise
          // auto-create the conversation (first contact). Their phone/name arrives
          // with the first ratchet message, so use a placeholder for now.
          let conv =
            conversations.find((c) => c.id === res.senderInbox) ??
            conversations.find(
              (c) => c.peer && bytesEqual(c.peer.x25519Pub, res.peer.x25519Pub),
            );
          if (conv) {
            // Glare: if we were mid-initiating to this same peer (pendingAke set)
            // or had queued text, adopt this responder session and flush the
            // queue over it so nothing is stranded. Our own AKE_INIT's AKE_RESP
            // will then simply find no pending and be dropped.
            conv.outbox.forEach((queued, i) => {
              const payload = encodeRatchetText(queued, i === 0 ? (myPhone ?? '') : undefined);
              toSend.push({ frame: sealNext(res.state, payload, identity), inbox: conv!.id });
            });
            conv = {
              ...conv,
              peer: res.peer,
              ratchet: res.state,
              pendingAke: null,
              outbox: [],
              peerFingerprint: identityFingerprint(res.peer),
              safetyNumber: safetyNumberBetween(myPeer, res.peer),
            };
            conversations = conversations.map((c) => (c.id === conv!.id ? conv! : c));
          } else {
            rxNew++;
            conv = {
              id: res.senderInbox,
              name: 'New contact',
              phone: null,
              avatarColor: pickAvatarColor(res.senderInbox),
              lastMessage: '',
              lastMessageAt: row.createdAtMs,
              unreadCount: 0,
              peer: res.peer,
              peerFingerprint: identityFingerprint(res.peer),
              safetyNumber: safetyNumberBetween(myPeer, res.peer),
              verified: false,
              pendingAke: null,
              outbox: [],
              ratchet: res.state,
            };
            conversations = [...conversations, conv];
          }
          conversationsMutated = true;
          toSend.push({ frame: res.frame, inbox: res.senderInbox });
          ackIds.push(row.id);
        } else if (v === FRAME_AKE_RESP) {
          // The reply to a handshake we initiated. Find the pending conversation by
          // trying to finish each (akeFinish binds the responder identity + our
          // ek_A), then flush any queued plaintext over the fresh ratchet.
          let matched: Conversation | null = null;
          let fin: ReturnType<typeof akeFinish> = null;
          for (const c of conversations) {
            if (!c.pendingAke) continue;
            const r = akeFinish(row.frame, c.pendingAke, identity);
            if (r) {
              matched = c;
              fin = r;
              break;
            }
          }
          if (!matched || !fin) {
            rxDrop++;
            lastDrop = 'ake-resp no match';
            ackIds.push(row.id);
            continue;
          }
          const ratchet = fin.state;
          matched.outbox.forEach((queued, i) => {
            const payload = encodeRatchetText(queued, i === 0 ? (myPhone ?? '') : undefined);
            toSend.push({ frame: sealNext(ratchet, payload, identity), inbox: matched!.id });
          });
          const updated: Conversation = {
            ...matched,
            peer: fin.peer,
            ratchet,
            pendingAke: null,
            outbox: [],
          };
          conversations = conversations.map((c) => (c.id === updated.id ? updated : c));
          conversationsMutated = true;
          ackIds.push(row.id);
        } else if (v === FRAME_RATCHET) {
          // senderIdPub sits after [ver | dhPub(32) | pn(4) | n(4)] in the AAD.
          const senderIdPub = row.frame.subarray(
            1 + X25519_KEY_BYTES + 4 + 4,
            1 + X25519_KEY_BYTES + 4 + 4 + X25519_KEY_BYTES,
          );
          const conv = conversations.find(
            (c) => c.ratchet && c.peer && bytesEqual(c.peer.x25519Pub, senderIdPub),
          );
          if (!conv || !conv.ratchet) {
            // No established session — the handshake that should precede this is
            // gone (peer reset, or truly orphaned). Drop it server-side so it stops
            // re-spamming; a healthy first message is always preceded by its AKE.
            rxDrop++;
            lastDrop = 'ratchet no session';
            ackIds.push(row.id);
            continue;
          }
          const opened = openNext(conv.ratchet, row.frame);
          if (!opened) {
            rxDrop++;
            lastDrop = 'ratchet decrypt';
            continue;
          }
          const decoded = decodeRatchetText(opened.plaintext);
          if (!decoded) {
            rxDrop++;
            lastDrop = 'ratchet decode';
            ackIds.push(row.id);
            continue;
          }
          conversationsMutated = true;
          // The initiator's first message carries their phone — adopt it as the
          // chat title if we only had the placeholder from AKE_INIT.
          if (decoded.phone && (!conv.phone || conv.name === 'New contact')) {
            const titled: Conversation = { ...conv, phone: decoded.phone, name: decoded.phone };
            conversations = conversations.map((c) => (c.id === conv.id ? titled : c));
          }

          const msgId = `wire-${row.id}`;
          const bucket = nextBuckets[conv.id] ?? [];
          if (!bucket.some((m) => m.id === msgId)) {
            bucket.push({
              id: msgId,
              author: 'them',
              from: conv.id,
              text: decoded.text,
              sentAt: row.createdAtMs,
            });
            nextBuckets[conv.id] = bucket;
            rxMsg++;
          }
          ackIds.push(row.id);
        } else {
          console.warn('[inbox] DROP: unknown frame version', v, row.id);
          rxDrop++;
          lastDrop = 'unknown ver';
          ackIds.push(row.id);
        }
      }

      if (conversationsMutated) {
        for (const id of Object.keys(nextBuckets)) {
          nextBuckets[id] = [...nextBuckets[id]].sort((a, b) => a.sentAt - b.sentAt);
        }
        const finalConversations = conversations.map((c) => {
          const last = nextBuckets[c.id]?.[nextBuckets[c.id].length - 1];
          if (!last) return c;
          return {
            ...c,
            lastMessage: last.text,
            lastMessageAt: last.sentAt,
            unreadCount:
              get().activeConversationId === c.id || last.author === 'me'
                ? c.unreadCount
                : c.unreadCount + 1,
          };
        });
        set({ messagesByConversationId: nextBuckets, conversations: finalConversations });
        persist({ conversations: finalConversations, messagesByConversationId: nextBuckets });
      }
      // Send AKE_RESP replies and any flushed first messages now that state is
      // committed (so a crash mid-send leaves us able to recover from persisted
      // pending/outbox state).
      for (const s of toSend) {
        try {
          await apiBinaryRequest('POST', '/messages', s.frame, token, { 'X-Inbox-Id': s.inbox });
        } catch (e) {
          console.warn('[inbox] outbound send failed', e);
        }
      }
      // Tell the server to drop everything we've handled so it isn't re-delivered.
      if (ackIds.length > 0) {
        void apiJsonPost('/messages/ack', { ids: ackIds }, token).catch((e) =>
          console.warn('[inbox] ack failed', e),
        );
      }
      set({
        debugStatus: `rx ${rows.length}: new ${rxNew}, msg ${rxMsg}, drop ${rxDrop}${
          lastDrop ? ` (${lastDrop})` : ''
        }`,
      });
    } catch (e) {
      console.warn('[inbox] fetch error', e);
      const msg = e instanceof ApiError ? `${e.status} ${e.message}` : 'network';
      set({ debugStatus: `rx error: ${msg}` });
    } finally {
      set({ inboxPending: false });
    }
  },
}));

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < MIN) return 'now';
  if (diff < HR) return `${Math.floor(diff / MIN)}m`;
  if (diff < DAY) return `${Math.floor(diff / HR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return `${Math.floor(diff / (7 * DAY))}w`;
}
