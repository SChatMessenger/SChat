import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  formatRelativeTime,
  shortFingerprint,
  useAppStore,
  useBootStore,
  useChatStore,
  useIdentityStore,
  type Conversation,
} from '../../src/stores';
import { useTheme, type Theme } from '../../src/theme';

const E2EE_GREEN = '#22c55e';

export function ChatListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const conversations = useChatStore((s) => s.conversations);
  const openConversation = useChatStore((s) => s.openConversation);
  const phone = useIdentityStore((s) => s.phone);
  const cycleThemeOverride = useAppStore((s) => s.cycleThemeOverride);
  const resetBoot = useBootStore((s) => s.reset);
  const resetIdentity = useIdentityStore((s) => s.reset);
  const replayBoot = () => {
    resetIdentity();
    resetBoot();
  };

  const sorted = [...conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const fingerprint = shortFingerprint(phone || 'self');
  const initial = (phone.replace(/\D/g, '').slice(-1) || 'Y').toUpperCase();

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.navbar,
          {
            paddingTop: insets.top + theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.sm,
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={styles.navRow}>
          <View style={styles.identity}>
            <View style={[styles.miniAvatar, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.miniInitial, { color: theme.colors.onPrimary }]}>
                {initial}
              </Text>
            </View>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.text, fontWeight: '600', marginLeft: theme.spacing.sm },
              ]}
            >
              you
            </Text>
            <View
              style={[
                styles.tag,
                {
                  borderColor: theme.colors.border,
                  marginLeft: theme.spacing.sm,
                },
              ]}
            >
              <Text
                style={[
                  styles.tagText,
                  { color: theme.colors.textMuted, fontVariant: ['tabular-nums'] },
                ]}
              >
                {fingerprint}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <View
            style={[
              styles.e2eePill,
              { backgroundColor: hexAlpha(E2EE_GREEN, theme.scheme === 'dark' ? 0.2 : 0.14) },
            ]}
          >
            <View style={[styles.e2eeDot, { backgroundColor: E2EE_GREEN }]} />
            <Text style={[styles.e2eeText, { color: E2EE_GREEN }]}>e2ee</Text>
          </View>

          <Pressable
            onPress={() => {}}
            hitSlop={8}
            style={({ pressed }) => [
              styles.compose,
              {
                backgroundColor: theme.colors.primary,
                marginLeft: theme.spacing.sm,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.composeGlyph, { color: theme.colors.onPrimary }]}>+</Text>
          </Pressable>
        </View>

        <View style={[styles.subRow, { marginTop: theme.spacing.xs }]}>
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, fontSize: 11 },
            ]}
          >
            {conversations.length} chats · {totalUnread} unread
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={cycleThemeOverride} hitSlop={6}>
            <Text style={[styles.subAction, { color: theme.colors.textMuted }]}>theme</Text>
          </Pressable>
          <Pressable
            onPress={replayBoot}
            hitSlop={6}
            style={{ marginLeft: theme.spacing.md }}
          >
            <Text style={[styles.subAction, { color: theme.colors.textMuted }]}>replay</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            theme={theme}
            onPress={() => openConversation(item.id)}
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
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function ConversationRow({
  conversation,
  theme,
  onPress,
}: {
  conversation: Conversation;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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

function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navbar: {},
  navRow: { flexDirection: 'row', alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center' },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniInitial: { fontSize: 13, fontWeight: '700' },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: { fontSize: 11, letterSpacing: 0.5 },
  e2eePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  e2eeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  e2eeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  compose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeGlyph: { fontSize: 22, lineHeight: 24, fontWeight: '500' },
  subRow: { flexDirection: 'row', alignItems: 'center' },
  subAction: { fontSize: 11, letterSpacing: 0.5 },
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
