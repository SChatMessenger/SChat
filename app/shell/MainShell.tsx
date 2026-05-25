import { View } from 'react-native';
import { ChatListScreen, ChatThreadScreen, NewChatScreen } from '../chat';
import { useChatStore, useTabsStore } from '../../src/stores';
import { BottomTabs } from './BottomTabs';
import { CommunitiesScreen } from './CommunitiesScreen';
import { ProfileScreen } from './ProfileScreen';
import { StatusScreen } from './StatusScreen';

export function MainShell() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const composing = useChatStore((s) => s.composing);
  const activeTab = useTabsStore((s) => s.activeTab);

  if (activeId) return <ChatThreadScreen />;
  if (composing) return <NewChatScreen />;

  return (
    <View style={{ flex: 1 }}>
      {activeTab === 'chats' ? <ChatListScreen /> : null}
      {activeTab === 'status' ? <StatusScreen /> : null}
      {activeTab === 'communities' ? <CommunitiesScreen /> : null}
      {activeTab === 'profile' ? <ProfileScreen /> : null}
      <BottomTabs />
    </View>
  );
}
