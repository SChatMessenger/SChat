import { create } from 'zustand';
import { ApiError, apiBinaryRequest } from '../../services/api/client';
import {
  BUNDLE_BYTES,
  deserializeBundle,
  identityFingerprint,
  safetyNumberBetween,
  serializeBundle,
  verifyBundleSignature,
} from '../../services/crypto/keys';
import {
  ED25519_SIG_BYTES,
  X25519_KEY_BYTES,
  bytesEqual,
  ed25519Verify,
  hex,
  unhex,
  utf8Decode,
  utf8Encode,
} from '../../services/crypto/primitives';
import { saveIdentity } from '../../services/crypto/persist';
import {
  deserializeRatchet,
  loadChats,
  saveChats,
  serializeRatchet,
  type SerializedChats,
  type SerializedConversation,
} from '../../services/crypto/persist';
import {
  bootstrapAsInitiator,
  bootstrapAsResponder,
  openNext,
  peekVersion,
  sealNext,
  type RatchetState,
} from '../../services/crypto/ratchet';
import {
  FRAME_BOOTSTRAP,
  FRAME_RATCHET,
  type IdentityPublicBundle,
  type PeerOpk,
} from '../../services/crypto/session';
import { useIdentityStore } from './useIdentityStore';

export type Conversation = {
  id: string;
  name: string;
  phone?: string | null;
  avatarColor: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  peer: IdentityPublicBundle | null;
  peerFingerprint: string | null;
  safetyNumber: string | null;
  verified: boolean;
  peerOpk: PeerOpk | null;
  ratchet: RatchetState | null;
};

export type Message = {
  id: string;
  author: 'me' | 'them';
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
  fetchInbox: () => Promise<void>;
  hydrateChats: () => Promise<void>;
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

function parseLookupResponse(
  bytes: Uint8Array,
): { inboxId: string; peer: IdentityPublicBundle; peerOpk: PeerOpk | null } | null {
  let off = 0;
  const a = readU16LE(bytes, off);
  off = a.next;
  const inboxId = utf8Decode(bytes.subarray(off, off + a.value));
  off += a.value;
  const bundleBytes = bytes.subarray(off, off + BUNDLE_BYTES);
  if (bundleBytes.length !== BUNDLE_BYTES) return null;
  const peer = deserializeBundle(new Uint8Array(bundleBytes));
  if (!peer) return null;
  off += BUNDLE_BYTES;

  let peerOpk: PeerOpk | null = null;
  if (off < bytes.length) {
    const flag = bytes[off];
    off += 1;
    if (flag === 1) {
      if (off + 4 + X25519_KEY_BYTES + ED25519_SIG_BYTES > bytes.length) return null;
      const opkId = readU32LE(bytes, off).value;
      off += 4;
      const pub = new Uint8Array(bytes.subarray(off, off + X25519_KEY_BYTES));
      off += X25519_KEY_BYTES;
      const sig = new Uint8Array(bytes.subarray(off, off + ED25519_SIG_BYTES));
      peerOpk = { id: opkId, pub, sig };
    }
  }

  return { inboxId, peer, peerOpk };
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
      peerBundleHex: c.peer ? hex(serializeBundle(c.peer)) : null,
      peerFingerprint: c.peerFingerprint,
      safetyNumber: c.safetyNumber,
      verified: c.verified,
      peerOpkId: c.peerOpk?.id,
      peerOpkPubHex: c.peerOpk ? hex(c.peerOpk.pub) : undefined,
      peerOpkSigHex: c.peerOpk ? hex(c.peerOpk.sig) : undefined,
      ratchet: c.ratchet ? serializeRatchet(c.ratchet) : null,
    })),
    messages: messagesByConversationId,
  };
}

function persist(state: { conversations: Conversation[]; messagesByConversationId: Record<string, Message[]> }) {
  void saveChats(snapshot(state.conversations, state.messagesByConversationId)).catch((e) =>
    console.warn('chat persist failed', e),
  );
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
  hydrateChats: async () => {
    if (get().hydrated) return;
    const loaded = await loadChats();
    if (!loaded) {
      set({ hydrated: true });
      return;
    }
    const myInbox = useIdentityStore.getState().inboxId;
    const filtered = loaded.conversations.filter((c) => !myInbox || c.id !== myInbox);
    const filteredMessages: Record<string, Message[]> = {};
    for (const c of filtered) {
      if (loaded.messages?.[c.id]) filteredMessages[c.id] = loaded.messages[c.id];
    }
    const conversations: Conversation[] = filtered.map((c) => {
      const peer = c.peerBundleHex ? deserializeBundle(unhex(c.peerBundleHex)) : null;
      const peerOpk: PeerOpk | null =
        c.peerOpkId && c.peerOpkPubHex && c.peerOpkSigHex
          ? {
              id: c.peerOpkId,
              pub: unhex(c.peerOpkPubHex),
              sig: unhex(c.peerOpkSigHex),
            }
          : null;
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
        peerOpk,
        ratchet: c.ratchet ? deserializeRatchet(c.ratchet) : null,
      };
    });
    set({
      conversations,
      messagesByConversationId: filteredMessages,
      hydrated: true,
    });
    if (filtered.length !== loaded.conversations.length) {
      persist({ conversations, messagesByConversationId: filteredMessages });
    }
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
      if (!verifyBundleSignature(parsed.peer)) {
        set({ lookupPending: false, lookupError: 'Peer bundle signature invalid — possible MITM.' });
        return;
      }
      if (parsed.peerOpk) {
        const valid = ed25519Verify(parsed.peer.ed25519Pub, parsed.peerOpk.pub, parsed.peerOpk.sig);
        if (!valid) {
          set({ lookupPending: false, lookupError: 'One-time pre-key signature invalid — rejecting.' });
          return;
        }
      }
      const { inboxId, peer, peerOpk } = parsed;

      const myInbox = useIdentityStore.getState().inboxId;
      if (myInbox && inboxId === myInbox) {
        set({ lookupPending: false, lookupError: "That's your own number." });
        return;
      }

      const myIdentity = useIdentityStore.getState().identity;
      const myPub = myIdentity
        ? {
            x25519Pub: myIdentity.x25519.pub,
            kyberPub: myIdentity.kyber.pub,
            ed25519Pub: myIdentity.ed25519.pub,
            signedPrekeyPub: myIdentity.signedPrekey.pub,
            signedPrekeySig: myIdentity.signedPrekey.sig,
          }
        : null;

      const { conversations, messagesByConversationId } = get();
      if (!conversations.some((c) => c.id === inboxId)) {
        const newConv: Conversation = {
          id: inboxId,
          name: trimmed,
          avatarColor: pickAvatarColor(inboxId),
          lastMessage: '',
          lastMessageAt: Date.now(),
          unreadCount: 0,
          peer,
          peerFingerprint: identityFingerprint(peer),
          safetyNumber: myPub ? safetyNumberBetween(myPub, peer) : null,
          verified: false,
          peerOpk,
          ratchet: null,
        };
        const nextConvs = [...conversations, newConv];
        const nextMsgs = { ...messagesByConversationId, [inboxId]: [] };
        set({ conversations: nextConvs, messagesByConversationId: nextMsgs });
        persist({ conversations: nextConvs, messagesByConversationId: nextMsgs });
      } else if (peerOpk) {
        const nextConvs = conversations.map((c) =>
          c.id === inboxId && !c.ratchet ? { ...c, peerOpk } : c,
        );
        set({ conversations: nextConvs });
        persist({ conversations: nextConvs, messagesByConversationId });
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
    const { token, identity } = useIdentityStore.getState();
    if (!token || !identity) {
      set({ sendError: 'Not signed in.' });
      return;
    }

    const pt = utf8Encode(trimmed);
    let frame: Uint8Array;
    let nextRatchet: RatchetState;
    let consumedOpk = false;
    if (!conversation.ratchet) {
      const boot = bootstrapAsInitiator(pt, conversation.peer, identity, conversation.peerOpk);
      frame = boot.frame;
      nextRatchet = boot.state;
      consumedOpk = !!conversation.peerOpk;
    } else {
      frame = sealNext(conversation.ratchet, pt, identity);
      nextRatchet = conversation.ratchet;
    }

    const sentAt = Date.now();
    const localId = `local-${sentAt}-${hex(frame.subarray(1, 9))}`;
    const optimistic: Message = {
      id: localId,
      author: 'me',
      text: trimmed,
      sentAt,
    };
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
            lastMessage: trimmed,
            lastMessageAt: sentAt,
            ratchet: nextRatchet,
            peerOpk: consumedOpk ? null : c.peerOpk,
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
      await apiBinaryRequest('POST', '/messages', frame, token, {
        'X-Inbox-Id': conversation.id,
      });
      set({ sendPending: false });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Send failed.';
      set({ sendPending: false, sendError: msg });
    }
  },
  fetchInbox: async () => {
    const { inboxPending } = get();
    if (inboxPending) return;
    const { token, identity } = useIdentityStore.getState();
    if (!token || !identity) return;
    set({ inboxPending: true });
    try {
      const bytes = await apiBinaryRequest('GET', '/messages?limit=200', undefined, token);
      const rows = parseInboxStream(bytes);
      let { conversations, messagesByConversationId } = get();
      const nextBuckets: Record<string, Message[]> = { ...messagesByConversationId };
      let conversationsMutated = false;

      let opksConsumed = 0;
      for (const row of rows) {
        const v = peekVersion(row.frame);
        if (v === FRAME_BOOTSTRAP) {
          const res = bootstrapAsResponder(row.frame, identity);
          if (!res) continue;
          let conv = conversations.find(
            (c) => c.peer && bytesEqual(c.peer.x25519Pub, res.senderX25519Pub),
          );
          if (!conv) continue;
          conv = { ...conv, ratchet: res.state };
          conversations = conversations.map((c) => (c.id === conv!.id ? conv! : c));
          conversationsMutated = true;
          opksConsumed += 1;

          const msgId = `wire-${row.id}`;
          const bucket = nextBuckets[conv.id] ?? [];
          if (!bucket.some((m) => m.id === msgId)) {
            bucket.push({
              id: msgId,
              author: 'them',
              text: utf8Decode(res.plaintext),
              sentAt: row.createdAtMs,
            });
            nextBuckets[conv.id] = bucket;
          }
        } else if (v === FRAME_RATCHET) {
          const conv = conversations.find(
            (c) =>
              c.ratchet &&
              c.peer &&
              bytesEqual(
                c.peer.x25519Pub,
                row.frame.subarray(
                  1 + X25519_KEY_BYTES + 4 + 4,
                  1 + X25519_KEY_BYTES + 4 + 4 + X25519_KEY_BYTES,
                ),
              ),
          );
          if (!conv || !conv.ratchet) continue;
          const opened = openNext(conv.ratchet, row.frame);
          if (!opened) continue;
          conversationsMutated = true;

          const msgId = `wire-${row.id}`;
          const bucket = nextBuckets[conv.id] ?? [];
          if (!bucket.some((m) => m.id === msgId)) {
            bucket.push({
              id: msgId,
              author: 'them',
              text: utf8Decode(opened.plaintext),
              sentAt: row.createdAtMs,
            });
            nextBuckets[conv.id] = bucket;
          }
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
      if (opksConsumed > 0) {
        void saveIdentity(identity).catch((e) => console.warn('opk persist failed', e));
        void useIdentityStore.getState().refillOpksIfLow();
      }
    } catch {
      // silent; UI keeps prior state
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
