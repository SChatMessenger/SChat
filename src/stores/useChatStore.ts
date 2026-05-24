import { create } from 'zustand';

export type Conversation = {
  id: string;
  name: string;
  avatarColor: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
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
  openConversation: (id: string) => void;
  closeConversation: () => void;
  sendMessage: (text: string) => void;
};

const now = Date.now();
const MIN = 60 * 1000;
const HR = 60 * MIN;
const DAY = 24 * HR;

const seedConversations: Conversation[] = [
  {
    id: 'alex',
    name: 'Alex Chen',
    avatarColor: '#2563eb',
    lastMessage: "Sounds good — let's sync tomorrow.",
    lastMessageAt: now - 12 * MIN,
    unreadCount: 0,
  },
  {
    id: 'family',
    name: 'Family',
    avatarColor: '#ef4444',
    lastMessage: "Mom: Don't forget grandma's birthday!",
    lastMessageAt: now - 1 * HR,
    unreadCount: 3,
  },
  {
    id: 'priya',
    name: 'Priya Sharma',
    avatarColor: '#10b981',
    lastMessage: 'Thanks for sending those!',
    lastMessageAt: now - 3 * HR,
    unreadCount: 0,
  },
  {
    id: 'ops',
    name: 'Ops on-call',
    avatarColor: '#f59e0b',
    lastMessage: 'Incident #4421 resolved',
    lastMessageAt: now - 1 * DAY,
    unreadCount: 0,
  },
  {
    id: 'jordan',
    name: 'Jordan Lee',
    avatarColor: '#a855f7',
    lastMessage: 'Can you review the doc?',
    lastMessageAt: now - 2 * DAY,
    unreadCount: 1,
  },
];

const seedMessages: Record<string, Message[]> = {
  alex: [
    { id: 'a1', author: 'them', text: 'Hey, ready for the demo?', sentAt: now - 25 * MIN },
    { id: 'a2', author: 'me', text: 'Yeah, just polishing slides.', sentAt: now - 23 * MIN },
    { id: 'a3', author: 'them', text: 'Cool. Want to do a dry run?', sentAt: now - 20 * MIN },
    { id: 'a4', author: 'me', text: 'Tomorrow morning works.', sentAt: now - 15 * MIN },
    {
      id: 'a5',
      author: 'them',
      text: "Sounds good — let's sync tomorrow.",
      sentAt: now - 12 * MIN,
    },
  ],
  family: [
    {
      id: 'f1',
      author: 'them',
      text: 'Mom: Did anyone call grandma this week?',
      sentAt: now - 90 * MIN,
    },
    {
      id: 'f2',
      author: 'them',
      text: "Mom: Don't forget grandma's birthday!",
      sentAt: now - 1 * HR,
    },
  ],
  priya: [
    { id: 'p1', author: 'me', text: 'Sending the photos now.', sentAt: now - 4 * HR },
    { id: 'p2', author: 'them', text: 'Thanks for sending those!', sentAt: now - 3 * HR },
  ],
  ops: [
    { id: 'o1', author: 'them', text: 'Page: API p99 > 5s', sentAt: now - 26 * HR },
    { id: 'o2', author: 'me', text: 'Looking now.', sentAt: now - 25 * HR },
    { id: 'o3', author: 'them', text: 'Incident #4421 resolved', sentAt: now - 24 * HR },
  ],
  jordan: [
    { id: 'j1', author: 'them', text: 'Can you review the doc?', sentAt: now - 2 * DAY },
  ],
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: seedConversations,
  messagesByConversationId: seedMessages,
  activeConversationId: null,
  openConversation: (id) =>
    set((s) => ({
      activeConversationId: id,
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, unreadCount: 0 } : c,
      ),
    })),
  closeConversation: () => set({ activeConversationId: null }),
  sendMessage: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { activeConversationId, messagesByConversationId, conversations } = get();
    if (!activeConversationId) return;
    const sentAt = Date.now();
    const message: Message = {
      id: `${sentAt}-${Math.random().toString(36).slice(2, 8)}`,
      author: 'me',
      text: trimmed,
      sentAt,
    };
    set({
      messagesByConversationId: {
        ...messagesByConversationId,
        [activeConversationId]: [
          ...(messagesByConversationId[activeConversationId] ?? []),
          message,
        ],
      },
      conversations: conversations.map((c) =>
        c.id === activeConversationId
          ? { ...c, lastMessage: trimmed, lastMessageAt: sentAt }
          : c,
      ),
    });
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
