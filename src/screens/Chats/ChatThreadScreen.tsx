import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useChatStore, type Conversation, type Message } from '../../store';
import { useTheme, type Theme } from '../../theme';

const VERIFIED_GREEN = '#22c55e';
const UNVERIFIED_AMBER = '#f59e0b';
const EMPTY_MESSAGES: Message[] = [];

export function ChatThreadScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const activeId = useChatStore((s) => s.activeConversationId);
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId),
  );
  const messages = useChatStore(
    (s) =>
      (s.activeConversationId
        ? s.messagesByConversationId[s.activeConversationId]
        : undefined) ?? EMPTY_MESSAGES,
  );
  const sendMessage = useChatStore((s) => s.sendMessage);
  const closeConversation = useChatStore((s) => s.closeConversation);
  const setConversationVerified = useChatStore((s) => s.setConversationVerified);

  const [draft, setDraft] = useState('');
  const [verifyOpen, setVerifyOpen] = useState(false);
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

  const peerFingerprint = conversation.peerFingerprint ?? '????????';
  const verifiedBadgeColor = conversation.verified ? VERIFIED_GREEN : UNVERIFIED_AMBER;
  const verifiedLabel = conversation.verified ? 'verified' : 'tap to verify';

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
            <Pressable
              onPress={() => setVerifyOpen(true)}
              hitSlop={6}
              style={styles.verifiedLine}
            >
              <Text style={[styles.verifiedCheck, { color: verifiedBadgeColor }]}>
                {conversation.verified ? '✓' : '!'}
              </Text>
              <Text
                style={[
                  styles.verifiedText,
                  { color: theme.colors.textMuted, fontVariant: ['tabular-nums'] },
                ]}
              >
                {verifiedLabel} · {peerFingerprint}
              </Text>
            </Pressable>
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
      <SafetyNumberModal
        visible={verifyOpen}
        conversation={conversation}
        theme={theme}
        onClose={() => setVerifyOpen(false)}
        onToggleVerified={(v) => setConversationVerified(conversation.id, v)}
      />
    </View>
  );
}

function SafetyNumberModal({
  visible,
  conversation,
  theme,
  onClose,
  onToggleVerified,
}: {
  visible: boolean;
  conversation: Conversation;
  theme: Theme;
  onClose: () => void;
  onToggleVerified: (v: boolean) => void;
}) {
  const number = conversation.safetyNumber ?? '— not available —';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <View style={[modalStyles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[theme.typography.title, { color: theme.colors.text }]}>
            Safety number
          </Text>
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: 4 },
            ]}
          >
            Compare these 60 digits with {conversation.name} over a trusted channel.
            If they match, this session has not been MITM'd.
          </Text>

          <View style={modalStyles.numberBox}>
            <Text
              style={[
                modalStyles.numberText,
                {
                  color: theme.colors.text,
                  fontVariant: ['tabular-nums'],
                },
              ]}
            >
              {number}
            </Text>
          </View>

          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: theme.spacing.md },
            ]}
          >
            Peer key fingerprint: {conversation.peerFingerprint ?? '—'}
          </Text>

          <View style={modalStyles.actions}>
            <Pressable
              onPress={() => {
                onToggleVerified(!conversation.verified);
                onClose();
              }}
              style={({ pressed }) => [
                modalStyles.btn,
                {
                  backgroundColor: conversation.verified
                    ? theme.colors.surface
                    : VERIFIED_GREEN,
                  borderColor: theme.colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: conversation.verified ? theme.colors.text : '#fff',
                  fontWeight: '600',
                }}
              >
                {conversation.verified ? 'Mark unverified' : 'Mark verified'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                modalStyles.btn,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { padding: 20, borderRadius: 16 },
  numberBox: { marginTop: 16 },
  numberText: { fontSize: 18, lineHeight: 26, letterSpacing: 1, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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
