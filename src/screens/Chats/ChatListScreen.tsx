import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Iconify } from 'react-native-iconify';
import {
  formatRelativeTime,
  useChatStore,
  type Conversation,
} from '../../store';
import { useTheme, type Theme } from '../../theme';
import { IconButton, PressableScale, ScreenHeader } from '../../components';

export function ChatListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const conversations = useChatStore((s) => s.conversations);
  const openConversation = useChatStore((s) => s.openConversation);
  const openCompose = useChatStore((s) => s.openCompose);
  const fetchInbox = useChatStore((s) => s.fetchInbox);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  // Measured height of the floating glass header, so the list can scroll behind
  // it; seeded with an estimate to avoid a first-frame jump.
  const [headerH, setHeaderH] = useState(insets.top + 76);
  const cancelSearch = () => {
    setSearching(false);
    setQuery('');
  };

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

  // Clear exactly the floating tab bar (bottom: insets.bottom + 8, height 56);
  // no extra padding so the list ends right at the bar's top edge.
  const tabClearance = insets.bottom + 64;
  const sorted = [...conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q),
      )
    : sorted;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {filtered.length === 0 ? (
        <View style={[styles.empty, { paddingTop: headerH }]}>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
            {q ? 'No chats found.' : 'No chats yet.'}
          </Text>
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: theme.spacing.xs },
            ]}
          >
            {q ? `nothing matches “${query.trim()}”` : 'tap + to find a contact'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          data={filtered}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingTop: headerH, paddingBottom: tabClearance }}
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

      <View
        style={styles.headerOverlay}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <ScreenHeader
          glass
          title="Chats"
          rightSlot={
            <>
              <IconButton
                icon="lucide:search"
                accessibilityLabel="Search chats"
                onPress={() => setSearching(true)}
              />
              <IconButton icon="lucide:more-vertical" accessibilityLabel="More options" />
            </>
          }
        />

        {searching ? (
          <View
            style={[
              styles.searchRow,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingBottom: theme.spacing.sm,
                backgroundColor: theme.colors.background,
              },
            ]}
          >
            <View
              style={[
                styles.searchField,
                { backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },
              ]}
            >
              <Iconify icon="lucide:search" size={16} color={theme.colors.textMuted} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search chats"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
                style={[
                  theme.typography.body,
                  { flex: 1, color: theme.colors.text, paddingVertical: 0, marginLeft: theme.spacing.sm },
                ]}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear">
                  <Iconify icon="lucide:x" size={16} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={cancelSearch} hitSlop={8} style={{ marginLeft: theme.spacing.md }}>
              <Text style={[theme.typography.body, { color: theme.colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <PressableScale
        scaleTo={0.9}
        onPress={openCompose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="New chat"
        style={({ pressed }: { pressed: boolean }) => ({
          ...styles.fab,
          right: theme.spacing.lg,
          bottom: tabClearance + theme.spacing.sm,
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.9 : 1,
          shadowColor: theme.colors.text,
        })}
      >
        <Text style={[styles.fabGlyph, { color: theme.colors.onPrimary }]}>+</Text>
      </PressableScale>
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
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 12,
  },
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
