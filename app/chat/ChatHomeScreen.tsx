import { useChatStore } from '../../src/stores';
import { ChatListScreen } from './ChatListScreen';
import { ChatThreadScreen } from './ChatThreadScreen';

export function ChatHomeScreen() {
  const activeId = useChatStore((s) => s.activeConversationId);
  return activeId ? <ChatThreadScreen /> : <ChatListScreen />;
}
