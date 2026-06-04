import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  I18nManager,
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
import { BlurView } from 'expo-blur';
import { Iconify } from 'react-native-iconify';
import { useChatStore, useIdentityStore, type Conversation, type Message } from '../../store';
import { useTheme, type Theme } from '../../theme';
import { useHardwareBack } from '../../hooks';
import { BottomSheet, IconButton } from '../../components';

const VERIFIED_GREEN = '#22c55e';
const UNVERIFIED_AMBER = '#f59e0b';
const DANGER_RED = '#ef4444';
const EMPTY_MESSAGES: Message[] = [];

// Physical placement that ignores RTL mirroring, so sent bubbles are always on
// the right and received on the left even when the device language is RTL.
const ALIGN_RIGHT: 'flex-start' | 'flex-end' = I18nManager.isRTL ? 'flex-start' : 'flex-end';
const ALIGN_LEFT: 'flex-start' | 'flex-end' = I18nManager.isRTL ? 'flex-end' : 'flex-start';

type SheetAction = {
  key: string;
  label: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
};

const ATTACH_ITEMS = [
  { key: 'gallery', label: 'Gallery', icon: 'lucide:image', color: '#a855f7' },
  { key: 'files', label: 'Files', icon: 'lucide:file', color: '#2563eb' },
  { key: 'location', label: 'Location', icon: 'lucide:map-pin', color: '#10b981' },
  { key: 'checklist', label: 'Checklist', icon: 'lucide:list-checks', color: '#f59e0b' },
  { key: 'contact', label: 'Contact', icon: 'lucide:contact', color: '#ec4899' },
  { key: 'music', label: 'Music', icon: 'lucide:music', color: '#06b6d4' },
  { key: 'events', label: 'Events', icon: 'lucide:calendar', color: '#ef4444' },
] as const;

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
  const myInbox = useIdentityStore((s) => s.inboxId);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const closeConversation = useChatStore((s) => s.closeConversation);
  const openChatProfile = useChatStore((s) => s.openChatProfile);
  const startCall = useChatStore((s) => s.startCall);
  const setConversationVerified = useChatStore((s) => s.setConversationVerified);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  const [draft, setDraft] = useState('');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Message | null>(null);
  // Measured glass navbar height so the message list scrolls behind it.
  const [navH, setNavH] = useState(insets.top + 56);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);

  const hasText = draft.trim().length > 0;
  const sendAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  // Camera ⇄ send morph: idle controls (attach + camera) cross-fade out as the
  // send button scales in the moment there's text to send.
  useEffect(() => {
    Animated.spring(sendAnim, {
      toValue: hasText ? 1 : 0,
      useNativeDriver: true,
      tension: 220,
      friction: 18,
    }).start();
  }, [hasText, sendAnim]);

  // Android back: peel off whichever layer is open before leaving the thread.
  useHardwareBack(
    useCallback(() => {
      if (attachOpen) {
        setAttachOpen(false);
      } else if (menuOpen) {
        setMenuOpen(false);
      } else if (callMenuOpen) {
        setCallMenuOpen(false);
      } else if (selected) {
        setSelected(null);
      } else if (verifyOpen) {
        setVerifyOpen(false);
      } else {
        closeConversation();
      }
      return true;
    }, [attachOpen, menuOpen, callMenuOpen, selected, verifyOpen, closeConversation]),
  );

  if (!activeId || !conversation) return null;

  const onSend = () => {
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft('');
  };

  const idleOpacity = sendAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const idleScale = sendAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });
  const sendScale = sendAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  const confirmDeleteChat = () => {
    Alert.alert(
      'Delete chat',
      `Remove the conversation with ${conversation.name}? Messages on this device will be erased.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteConversation(conversation.id),
        },
      ],
    );
  };

  const moreActions: SheetAction[] = [
    {
      key: 'profile',
      label: 'View contact',
      icon: 'lucide:user-round',
      onPress: () => {
        setMenuOpen(false);
        openChatProfile();
      },
    },
    {
      key: 'verify',
      label: 'Verify safety number',
      icon: 'lucide:shield-check',
      onPress: () => {
        setMenuOpen(false);
        setVerifyOpen(true);
      },
    },
    {
      key: 'search',
      label: 'Search in chat',
      icon: 'lucide:search',
      onPress: () => setMenuOpen(false),
    },
    {
      key: 'mute',
      label: 'Mute notifications',
      icon: 'lucide:bell-off',
      onPress: () => setMenuOpen(false),
    },
    {
      key: 'delete',
      label: 'Delete chat',
      icon: 'lucide:trash-2',
      destructive: true,
      onPress: () => {
        setMenuOpen(false);
        confirmDeleteChat();
      },
    },
  ];

  const callActions: SheetAction[] = [
    {
      key: 'voice',
      label: 'Voice call',
      icon: 'lucide:phone',
      onPress: () => {
        setCallMenuOpen(false);
        startCall('voice');
      },
    },
    {
      key: 'video',
      label: 'Video call',
      icon: 'lucide:video',
      onPress: () => {
        setCallMenuOpen(false);
        startCall('video');
      },
    },
    {
      key: 'meet',
      label: 'Meet',
      icon: 'lucide:users',
      onPress: () => {
        setCallMenuOpen(false);
        startCall('meet');
      },
    },
  ];

  const removeSelected = () => {
    if (selected) deleteMessage(activeId, selected.id);
    setSelected(null);
  };
  const messageActions: SheetAction[] = selected
    ? [
        {
          key: 'deleteMe',
          label: 'Delete for me',
          icon: 'lucide:trash-2',
          destructive: true,
          onPress: removeSelected,
        },
        ...(selected.author === 'me'
          ? [
              {
                key: 'deleteEveryone',
                label: 'Delete for everyone',
                icon: 'lucide:users',
                destructive: true,
                onPress: removeSelected,
              } as SheetAction,
            ]
          : []),
      ]
    : [];

  const peerFingerprint = conversation.peerFingerprint ?? '????????';
  const verifiedBadgeColor = conversation.verified ? VERIFIED_GREEN : UNVERIFIED_AMBER;
  const verifiedLabel = conversation.verified ? 'verified' : 'tap to verify';

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View
        style={styles.navOverlay}
        onLayout={(e) => setNavH(e.nativeEvent.layout.height)}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 75 : 100}
          tint={theme.scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.glassTint }]}
          pointerEvents="none"
        />
        <View
          style={{
            paddingTop: insets.top + theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            borderBottomColor: theme.colors.glassEdge,
            borderBottomWidth: StyleSheet.hairlineWidth,
          }}
        >
          <View style={styles.navRow}>
          <Pressable onPress={closeConversation} hitSlop={12} style={styles.backHit}>
            <Text style={[styles.backChevron, { color: conversation.avatarColor }]}>‹</Text>
          </Pressable>
          <Pressable
            onPress={openChatProfile}
            style={styles.titlePress}
            accessibilityRole="button"
            accessibilityLabel={`Open ${conversation.name} profile`}
          >
            <View style={[styles.navAvatar, { backgroundColor: conversation.avatarColor }]}>
              <Text style={styles.navAvatarInitial}>
                {conversation.name[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={styles.titleCol}>
              <Text numberOfLines={1} style={[styles.threadName, { color: theme.colors.text }]}>
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
          </Pressable>
          <IconButton
            icon="lucide:phone"
            onPress={() => setCallMenuOpen(true)}
            accessibilityLabel="Call"
          />
          <IconButton
            icon="lucide:more-vertical"
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="More options"
          />
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.md,
            // Clear the glass navbar at the top and the floating input bar at the
            // bottom; everything in between scrolls behind the glass.
            paddingTop: navH + theme.spacing.sm,
            paddingBottom: insets.bottom + 72,
          }}
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const showDay = !prev || !sameDay(prev.sentAt, item.sentAt);
            // Name only at the start of a received run (or after a day break).
            const showName =
              item.author === 'them' && (showDay || !prev || prev.author !== 'them');
            return (
              <View style={{ width: '100%' }}>
                {showDay ? (
                  <DaySeparator label={formatDayLabel(item.sentAt)} theme={theme} />
                ) : null}
                <Bubble
                  message={item}
                  theme={theme}
                  myInbox={myInbox}
                  senderName={showName ? conversation.name : null}
                  time={formatClock(item.sentAt)}
                  onSelect={() => setSelected(item)}
                />
              </View>
            );
          }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View
          style={[
            styles.inputOverlay,
            {
              paddingHorizontal: theme.spacing.md,
              paddingTop: theme.spacing.sm,
              paddingBottom: insets.bottom + theme.spacing.sm,
            },
          ]}
        >
          <View style={[styles.glassFrame, glassShadow(theme)]}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 75 : 100}
              tint={theme.scheme === 'dark' ? 'dark' : 'light'}
              style={styles.glassBlur}
            >
              <View
                style={[
                  styles.barInner,
                  { backgroundColor: theme.colors.glassTint, borderColor: theme.colors.glassEdge },
                ]}
              >
                <Pressable
                  onPress={() => inputRef.current?.focus()}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Emoji"
                  style={styles.barIcon}
                >
                  <Iconify icon="lucide:smile" size={22} color={theme.colors.textMuted} />
                </Pressable>
                <TextInput
                  ref={inputRef}
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
                      paddingVertical: theme.spacing.sm,
                      maxHeight: 120,
                    },
                  ]}
                />
                <View style={styles.trailing}>
                  <Animated.View
                    pointerEvents={hasText ? 'none' : 'auto'}
                    style={[
                      styles.idleLayer,
                      { opacity: idleOpacity, transform: [{ scale: idleScale }] },
                    ]}
                  >
                    <Pressable
                      onPress={() => setAttachOpen(true)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Attach"
                      style={styles.barIcon}
                    >
                      <Iconify icon="lucide:paperclip" size={22} color={theme.colors.textMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => setAttachOpen(true)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Camera"
                      style={styles.barIcon}
                    >
                      <Iconify icon="lucide:camera" size={22} color={theme.colors.textMuted} />
                    </Pressable>
                  </Animated.View>
                  <Animated.View
                    pointerEvents={hasText ? 'auto' : 'none'}
                    style={[
                      styles.sendLayer,
                      { opacity: sendAnim, transform: [{ scale: sendScale }] },
                    ]}
                  >
                    <Pressable
                      onPress={onSend}
                      accessibilityRole="button"
                      accessibilityLabel="Send message"
                      style={({ pressed }) => [
                        styles.sendButton,
                        { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Iconify icon="lucide:send" size={18} color={theme.colors.onPrimary} />
                    </Pressable>
                  </Animated.View>
                </View>
              </View>
            </BlurView>
          </View>
        </View>
      </KeyboardAvoidingView>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />

      <AttachSheet
        visible={attachOpen}
        theme={theme}
        onDismiss={() => setAttachOpen(false)}
        onPick={() => setAttachOpen(false)}
      />
      <ActionSheet
        visible={callMenuOpen}
        title="Call"
        actions={callActions}
        theme={theme}
        onDismiss={() => setCallMenuOpen(false)}
      />
      <ActionSheet
        visible={menuOpen}
        title={conversation.name}
        actions={moreActions}
        theme={theme}
        onDismiss={() => setMenuOpen(false)}
      />
      <ActionSheet
        visible={selected !== null}
        title="Message"
        actions={messageActions}
        theme={theme}
        onDismiss={() => setSelected(null)}
      />
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

function AttachSheet({
  visible,
  theme,
  onDismiss,
  onPick,
}: {
  visible: boolean;
  theme: Theme;
  onDismiss: () => void;
  onPick: (key: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Attach">
      <View style={[attachStyles.grid, { paddingHorizontal: theme.spacing.md }]}>
        {ATTACH_ITEMS.map((it) => (
          <Pressable
            key={it.key}
            onPress={() => onPick(it.key)}
            accessibilityRole="button"
            accessibilityLabel={it.label}
            style={({ pressed }) => [attachStyles.tile, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View style={[attachStyles.tileIcon, { backgroundColor: it.color }]}>
              <Iconify icon={it.icon} size={24} color="#fff" />
            </View>
            <Text
              numberOfLines={1}
              style={[theme.typography.caption, { color: theme.colors.text, marginTop: 6 }]}
            >
              {it.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

function ActionSheet({
  visible,
  title,
  actions,
  theme,
  onDismiss,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  theme: Theme;
  onDismiss: () => void;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title}>
      {actions.map((a) => (
        <ActionRow key={a.key} action={a} theme={theme} />
      ))}
    </BottomSheet>
  );
}

function ActionRow({ action, theme }: { action: SheetAction; theme: Theme }) {
  const tint = action.destructive ? DANGER_RED : theme.colors.text;
  return (
    <Pressable
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={({ pressed }) => [
        actionStyles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          backgroundColor: pressed ? theme.colors.surface : 'transparent',
        },
      ]}
    >
      <Iconify
        icon={action.icon}
        size={20}
        color={action.destructive ? DANGER_RED : theme.colors.textMuted}
      />
      <Text
        style={[
          theme.typography.body,
          { color: tint, marginLeft: theme.spacing.md, fontWeight: '500' },
        ]}
      >
        {action.label}
      </Text>
    </Pressable>
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

function Bubble({
  message,
  theme,
  myInbox,
  senderName,
  time,
  onSelect,
}: {
  message: Message;
  theme: Theme;
  myInbox?: string | null;
  // Shown only on received bubbles, and only at the start of a received run.
  senderName?: string | null;
  time: string;
  onSelect: () => void;
}) {
  // Identity-anchored: mine iff the message's sender inbox is my inbox. Falls
  // back to the legacy `author` flag for messages saved before `from` existed.
  const mine =
    message.from != null && myInbox != null
      ? message.from === myInbox
      : message.author === 'me';
  return (
    <View
      style={[
        styles.bubbleRow,
        {
          alignItems: mine ? ALIGN_RIGHT : ALIGN_LEFT,
          marginVertical: theme.spacing.xs,
        },
      ]}
    >
      <Pressable
        onPress={onSelect}
        onLongPress={onSelect}
        delayLongPress={250}
        style={({ pressed }) => [
          styles.bubble,
          {
            backgroundColor: mine ? theme.colors.primary : theme.colors.surface,
            borderTopLeftRadius: mine ? theme.radii.lg : theme.radii.sm,
            borderTopRightRadius: mine ? theme.radii.sm : theme.radii.lg,
            borderBottomLeftRadius: theme.radii.lg,
            borderBottomRightRadius: theme.radii.lg,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        {senderName ? (
          <Text
            numberOfLines={1}
            style={[
              theme.typography.caption,
              { color: theme.colors.primary, fontWeight: '700', marginBottom: 2 },
            ]}
          >
            {senderName}
          </Text>
        ) : null}
        <Text
          style={[
            theme.typography.body,
            { color: mine ? theme.colors.onPrimary : theme.colors.text },
          ]}
        >
          {message.text}
        </Text>
        <Text
          style={[
            styles.timeText,
            {
              alignSelf: ALIGN_RIGHT,
              color: mine ? theme.colors.onPrimary : theme.colors.textMuted,
              opacity: mine ? 0.75 : 1,
            },
          ]}
        >
          {time}
        </Text>
      </Pressable>
    </View>
  );
}

function DaySeparator({ label, theme }: { label: string; theme: Theme }) {
  return (
    <View style={daySepStyles.wrap}>
      <View style={[daySepStyles.pill, { backgroundColor: theme.colors.surface }]}>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

function formatDayLabel(ts: number): string {
  const diffDays = (startOfDay(Date.now()) - startOfDay(ts)) / 86_400_000;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const daySepStyles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  navRow: { flexDirection: 'row', alignItems: 'center' },
  backHit: { width: 28, alignItems: 'flex-start', justifyContent: 'center' },
  backChevron: { fontSize: 32, lineHeight: 32, fontWeight: '300' },
  titlePress: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  navAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAvatarInitial: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  titleCol: { flex: 1, marginLeft: 10 },
  threadName: { fontSize: 17, fontWeight: '600' },
  verifiedLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  verifiedCheck: { fontSize: 11, fontWeight: '700', marginRight: 4 },
  verifiedText: { fontSize: 11, letterSpacing: 0.3 },
  inputOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  glassFrame: { borderRadius: 24 },
  glassBlur: { borderRadius: 24, overflow: 'hidden' },
  barInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 6,
    minHeight: 48,
  },
  barIcon: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  trailing: { width: 72, height: 44 },
  idleLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sendLayer: {
    position: 'absolute',
    right: 1,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full-width column; alignItems places the bubble left (received) or right
  // (sent). More robust than justifyContent-on-a-row.
  bubbleRow: { width: '100%' },
  bubble: { maxWidth: '80%' },
  timeText: { fontSize: 10, marginTop: 2, alignSelf: 'flex-end' },
});

// Soft drop shadow lifting the floating glass input bar off the content.
function glassShadow(theme: Theme) {
  return Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.scheme === 'dark' ? 0.5 : 0.16,
      shadowRadius: 20,
    },
    android: { elevation: 10 },
    default: {},
  });
}

const attachStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 4 },
  tile: { width: '25%', alignItems: 'center', paddingVertical: 12 },
  tileIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const actionStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
});
