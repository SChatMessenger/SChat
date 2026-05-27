import { View } from 'react-native';
import { ChatListScreen, ChatThreadScreen, NewChatScreen } from '../screens/Chats';
import { CommunitiesScreen } from '../screens/Communities';
import { ProfileScreen } from '../screens/Profile';
import { StatusScreen } from '../screens/Status';
import { useChatStore, useTabsStore } from '../store';
import { BottomTabs } from './BottomTabs';

export function AppNavigator() {
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
