import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  shortFingerprint,
  useChatStore,
  type Message,
} from '../../src/stores';
import { useTheme, type Theme } from '../../src/theme';

const VERIFIED_GREEN = '#22c55e';

export function ChatThreadScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const activeId = useChatStore((s) => s.activeConversationId);
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId),
  );
  const messages = useChatStore((s) =>
    s.activeConversationId ? s.messagesByConversationId[s.activeConversationId] ?? [] : [],
  );
  const sendMessage = useChatStore((s) => s.sendMessage);
  const closeConversation = useChatStore((s) => s.closeConversation);

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  if (!activeId || !conversation) return null;

  const onSend = () => {
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft('');
  };

  const peerFingerprint = shortFingerprint(conversation.id);

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.navbar,
          {
            paddingTop: insets.top + theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={styles.navRow}>
          <Pressable
            onPress={closeConversation}
            hitSlop={12}
            style={styles.backHit}
          >
            <Text style={[styles.backChevron, { color: conversation.avatarColor }]}>‹</Text>
          </Pressable>
          <View style={styles.titleCol}>
            <Text
              numberOfLines={1}
              style={[
                styles.threadName,
                { color: theme.colors.text },
              ]}
            >
              {conversation.name}
            </Text>
            <View style={styles.verifiedLine}>
              <Text style={[styles.verifiedCheck, { color: VERIFIED_GREEN }]}>✓</Text>
              <Text
                style={[
                  styles.verifiedText,
                  { color: theme.colors.textMuted, fontVariant: ['tabular-nums'] },
                ]}
              >
                verified · {peerFingerprint}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: theme.spacing.md }}
          renderItem={({ item }) => <Bubble message={item} theme={theme} />}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: theme.colors.border,
              borderTopWidth: StyleSheet.hairlineWidth,
              padding: theme.spacing.sm,
              paddingBottom: theme.spacing.sm + insets.bottom * 0.4,
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            style={[
              theme.typography.body,
              {
                flex: 1,
                color: theme.colors.text,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.lg,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                maxHeight: 120,
              },
            ]}
          />
          <Pressable
            onPress={onSend}
            disabled={!draft.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: theme.colors.primary,
                marginLeft: theme.spacing.sm,
                opacity: !draft.trim() ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[theme.typography.body, { color: theme.colors.onPrimary }]}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function Bubble({ message, theme }: { message: Message; theme: Theme }) {
  const mine = message.author === 'me';
  return (
    <View
      style={[
        styles.bubbleRow,
        {
          justifyContent: mine ? 'flex-end' : 'flex-start',
          marginVertical: theme.spacing.xs,
        },
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? theme.colors.primary : theme.colors.surface,
            borderTopLeftRadius: mine ? theme.radii.lg : theme.radii.sm,
            borderTopRightRadius: mine ? theme.radii.sm : theme.radii.lg,
            borderBottomLeftRadius: theme.radii.lg,
            borderBottomRightRadius: theme.radii.lg,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          },
        ]}
      >
        <Text
          style={[
            theme.typography.body,
            { color: mine ? theme.colors.onPrimary : theme.colors.text },
          ]}
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navbar: {},
  navRow: { flexDirection: 'row', alignItems: 'center' },
  backHit: { width: 32, alignItems: 'flex-start', justifyContent: 'center' },
  backChevron: { fontSize: 32, lineHeight: 32, fontWeight: '300' },
  titleCol: { flex: 1, marginLeft: 4 },
  threadName: { fontSize: 17, fontWeight: '600' },
  verifiedLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  verifiedCheck: { fontSize: 11, fontWeight: '700', marginRight: 4 },
  verifiedText: { fontSize: 11, letterSpacing: 0.3 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end' },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '80%' },
});
