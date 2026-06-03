import { StyleSheet, View } from 'react-native';
import {
  CallScreen,
  ChatListScreen,
  ChatThreadScreen,
  ContactProfileScreen,
  NewChatScreen,
} from '../screens/Chats';
import { CommunitiesScreen } from '../screens/Communities';
import {
  AccountScreen,
  ChatSettingsScreen,
  DataStorageScreen,
  NotificationsScreen,
  PrivacySecurityScreen,
  ProfileScreen,
  RegionLanguageScreen,
} from '../screens/Profile';
import { StatusScreen } from '../screens/Status';
import { useAppStore, useChatStore, useTabsStore } from '../store';
import { useTheme } from '../theme';
import { BottomTabs } from './BottomTabs';

export function AppNavigator() {
  const theme = useTheme();
  const activeId = useChatStore((s) => s.activeConversationId);
  const chatProfileOpen = useChatStore((s) => s.chatProfileOpen);
  const activeCall = useChatStore((s) => s.activeCall);
  const composing = useChatStore((s) => s.composing);
  const activeTab = useTabsStore((s) => s.activeTab);
  const profileRoute = useAppStore((s) => s.profileRoute);

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {/* Persistent tab base. It never unmounts when a screen is pushed, so the
          white native window can't flash through while the pushed screen mounts
          and slides in over it. */}
      {activeTab === 'chats' ? <ChatListScreen /> : null}
      {activeTab === 'status' ? <StatusScreen /> : null}
      {activeTab === 'communities' ? <CommunitiesScreen /> : null}
      {activeTab === 'profile' ? <ProfileScreen /> : null}
      <BottomTabs />

      {/* Pushed screens overlay the base, full-screen and opaque (later = on top). */}
      {activeTab === 'profile' && profileRoute === 'account' ? (
        <View style={styles.overlay}>
          <AccountScreen />
        </View>
      ) : null}
      {activeTab === 'profile' && profileRoute === 'chat-settings' ? (
        <View style={styles.overlay}>
          <ChatSettingsScreen />
        </View>
      ) : null}
      {activeTab === 'profile' && profileRoute === 'privacy-security' ? (
        <View style={styles.overlay}>
          <PrivacySecurityScreen />
        </View>
      ) : null}
      {activeTab === 'profile' && profileRoute === 'notifications' ? (
        <View style={styles.overlay}>
          <NotificationsScreen />
        </View>
      ) : null}
      {activeTab === 'profile' && profileRoute === 'data-storage' ? (
        <View style={styles.overlay}>
          <DataStorageScreen />
        </View>
      ) : null}
      {activeTab === 'profile' && profileRoute === 'region-language' ? (
        <View style={styles.overlay}>
          <RegionLanguageScreen />
        </View>
      ) : null}
      {composing ? (
        <View style={styles.overlay}>
          <NewChatScreen />
        </View>
      ) : null}
      {activeId ? (
        <View style={styles.overlay}>
          <ChatThreadScreen />
        </View>
      ) : null}
      {activeId && chatProfileOpen ? (
        <View style={styles.overlay}>
          <ContactProfileScreen />
        </View>
      ) : null}
      {activeId && activeCall ? (
        <View style={styles.overlay}>
          <CallScreen />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Pushed screens sit above the persistent base. The explicit zIndex both lifts
  // them over the base AND establishes a stacking context, so a base screen's
  // glass header (which uses its own zIndex) can't bleed up through the overlay.
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
});
