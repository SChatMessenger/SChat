import { create } from 'zustand';

// useChatStore — conversations, messages, calls, contact lookup.
//
// Rebuilt as local state after the services/ tree was deleted. The delivery
// paths (fetchInbox / inbox stream / sendMessage) are stubs until the Rust
// ratchet engine (seal_next/open_next → 0x03 frames) and the wiring to the
// relay's /messages surface land. UI-state actions (open/close/compose) are
// fully functional so the app navigates.

export type MsgStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  conversationId: string;
  author: 'me' | 'them';
  from?: string;
  text: string;
  status: MsgStatus;
  sentAt: number;
}

export interface Conversation {
  id: string;
  name: string;
  username?: string;
  phone?: string;
  phones?: string[];
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount?: number;
  avatarColor?: string;
  verified?: boolean;
  keyChanged?: boolean;
  status?: string;
  peerProfile?: unknown;
}

export interface VerifyScanResult {
  status: 'verified' | 'mismatch' | 'invalid' | 'pending';
  name?: string;
}

export const CHAT_FONT_MIN = 12;
export const CHAT_FONT_MAX = 24;
export const CHAT_FONT_DEFAULT = 16;

/** Short relative timestamp for the chat list ("now", "5m", "2h", "3d", date). */
export function formatRelativeTime(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}

type ChatState = {
  hydrated: boolean;
  conversations: Conversation[];
  messagesByConversationId: Record<string, Message[]>;
  activeConversationId: string | null;
  chatProfileOpen: boolean;
  composing: boolean;
  activeCall: { conversationId: string; video: boolean } | null;
  lookupPending: boolean;
  lookupError: string | null;
  debugStatus: string;

  hydrateChats: () => Promise<void>;
  fetchInbox: () => Promise<void>;
  startInboxStream: () => void;
  stopInboxStream: () => void;
  flushChatState: () => void;
  sweepEphemeral: () => void;

  openConversation: (id: string) => void;
  closeConversation: () => void;
  openCompose: () => void;
  closeCompose: () => void;
  openChatProfile: () => void;
  closeChatProfile: () => void;

  sendMessage: (text: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  deleteConversation: (id: string) => void;

  findContact: (query: string) => Promise<Conversation | null>;
  findByUsername: (username: string) => Promise<Conversation | null>;
  verifyByContactCode: (data: string) => VerifyScanResult;
  blockContact: (id: string) => void;
  editContact: (id: string, patch: Partial<Conversation>) => void;

  startCall: (conversationId: string, video?: boolean) => void;
  endCall: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  hydrated: false,
  conversations: [],
  messagesByConversationId: {},
  activeConversationId: null,
  chatProfileOpen: false,
  composing: false,
  activeCall: null,
  lookupPending: false,
  lookupError: null,
  debugStatus: '',

  // TODO: hydrate conversations + read cursors from the sealed vault.
  hydrateChats: async () => set({ hydrated: true }),
  // TODO: GET /messages → open_next() → append. No-op until the ratchet lands.
  fetchInbox: async () => {},
  startInboxStream: () => {},
  stopInboxStream: () => {},
  flushChatState: () => {},
  sweepEphemeral: () => {},

  openConversation: (id) => set({ activeConversationId: id }),
  closeConversation: () => set({ activeConversationId: null, chatProfileOpen: false }),
  openCompose: () => set({ composing: true }),
  closeCompose: () => set({ composing: false }),
  openChatProfile: () => set({ chatProfileOpen: true }),
  closeChatProfile: () => set({ chatProfileOpen: false }),

  // Optimistic local append; real send seals a 0x03 frame and POSTs /messages.
  sendMessage: (text) => {
    const id = get().activeConversationId;
    if (!id || !text.trim()) return;
    const msg: Message = {
      id: String(Date.now()),
      conversationId: id,
      author: 'me',
      text: text.trim(),
      status: 'sending',
      sentAt: Date.now(),
    };
    set((s) => ({
      messagesByConversationId: {
        ...s.messagesByConversationId,
        [id]: [...(s.messagesByConversationId[id] ?? []), msg],
      },
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, lastMessage: msg.text, lastMessageAt: msg.sentAt } : c,
      ),
    }));
  },
  deleteMessage: (conversationId, messageId) =>
    set((s) => ({
      messagesByConversationId: {
        ...s.messagesByConversationId,
        [conversationId]: (s.messagesByConversationId[conversationId] ?? []).filter((m) => m.id !== messageId),
      },
    })),
  deleteConversation: (id) =>
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),

  // TODO: GET /users/lookup (blind index) via the relay; needs FFI bundle verify.
  findContact: async (_query) => {
    set({ lookupPending: true, lookupError: null });
    set({ lookupPending: false, lookupError: 'Directory lookup not wired yet' });
    return null;
  },
  findByUsername: async (_username) => {
    set({ lookupPending: true, lookupError: null });
    set({ lookupPending: false, lookupError: 'Username lookup not wired yet' });
    return null;
  },
  // TODO: decode + verify the scanned contact code via the FFI.
  verifyByContactCode: (_data) => ({ status: 'invalid' }),
  blockContact: (id) =>
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, status: 'blocked' } : c)) })),
  editContact: (id, patch) =>
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

  startCall: (conversationId, video = false) => set({ activeCall: { conversationId, video } }),
  endCall: () => set({ activeCall: null }),
}));
