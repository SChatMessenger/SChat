import { useEffect } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Iconify } from 'react-native-iconify';
import {
  formatRelativeTime,
  useChatStore,
  type Conversation,
} from '../../store';
import { useTheme, type Theme } from '../../theme';

export function ChatListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const conversations = useChatStore((s) => s.conversations);
  const openConversation = useChatStore((s) => s.openConversation);
  const openCompose = useChatStore((s) => s.openCompose);
  const fetchInbox = useChatStore((s) => s.fetchInbox);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete chat',
      `Remove the conversation with ${name}? Messages on this device will be erased.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(id) },
      ],
    );
  };

  useEffect(() => {
    void fetchInbox();
    const id = setInterval(() => void fetchInbox(), 8000);
    return () => clearInterval(id);
  }, [fetchInbox]);

  const sorted = [...conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
        }}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[theme.typography.heading, { color: theme.colors.text }]}>
              Chats
            </Text>
            <View
              style={[
                styles.accent,
                { backgroundColor: theme.colors.primary, marginTop: theme.spacing.sm },
              ]}
            />
          </View>
          <Pressable
            hitSlop={10}
            style={({ pressed }) => [
              styles.headerBtn,
              {
                marginLeft: theme.spacing.xs,
                backgroundColor: pressed ? theme.colors.surface : 'transparent',
              },
            ]}
          >
            <Iconify icon="lucide:search" size={20} color={theme.colors.text} />
          </Pressable>
          <Pressable
            hitSlop={10}
            style={({ pressed }) => [
              styles.headerBtn,
              {
                marginLeft: theme.spacing.xs,
                backgroundColor: pressed ? theme.colors.surface : 'transparent',
              },
            ]}
          >
            <Iconify icon="lucide:more-vertical" size={20} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
            No chats yet.
          </Text>
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: theme.spacing.xs },
            ]}
          >
            tap + to find a contact
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              theme={theme}
              onPress={() => openConversation(item.id)}
              onLongPress={() => confirmDelete(item.id, item.name)}
            />
          )}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.border,
                marginLeft: theme.spacing.lg + 48 + theme.spacing.md,
              }}
            />
          )}
        />
      )}
      <Pressable
        onPress={openCompose}
        hitSlop={8}
        style={({ pressed }) => [
          styles.fab,
          {
            right: theme.spacing.lg,
            bottom: 96 + insets.bottom + theme.spacing.sm,
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.85 : 1,
            shadowColor: theme.colors.text,
          },
        ]}
      >
        <Text style={[styles.fabGlyph, { color: theme.colors.onPrimary }]}>+</Text>
      </Pressable>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function ConversationRow({
  conversation,
  theme,
  onPress,
  onLongPress,
}: {
  conversation: Conversation;
  theme: Theme;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          backgroundColor: pressed ? theme.colors.surface : 'transparent',
        },
      ]}
    >
      <View
        style={[
          styles.avatar,
          { backgroundColor: conversation.avatarColor, marginRight: theme.spacing.md },
        ]}
      >
        <Text style={styles.avatarInitial}>{conversation.name[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      <View style={styles.rowMain}>
        <View style={styles.rowTopLine}>
          <Text
            numberOfLines={1}
            style={[
              theme.typography.body,
              { color: theme.colors.text, flex: 1, fontWeight: '600' },
            ]}
          >
            {conversation.name}
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {formatRelativeTime(conversation.lastMessageAt)}
          </Text>
        </View>
        <View style={[styles.rowBottomLine, { marginTop: 2 }]}>
          <Text
            numberOfLines={1}
            style={[theme.typography.caption, { color: theme.colors.textMuted, flex: 1 }]}
          >
            {conversation.lastMessage}
          </Text>
          {conversation.unreadCount > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.primary, marginLeft: theme.spacing.sm },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.colors.onPrimary }]}>
                {conversation.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accent: { width: 28, height: 3, borderRadius: 2 },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  fabGlyph: { fontSize: 28, lineHeight: 30, fontWeight: '400' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  rowMain: { flex: 1 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center' },
  rowBottomLine: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
