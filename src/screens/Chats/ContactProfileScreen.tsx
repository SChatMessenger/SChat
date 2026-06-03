import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import { useChatStore } from '../../store';
import { useTheme, type Theme } from '../../theme';
import { Card, GlassHeader, IconButton, SectionLabel, SettingsRow } from '../../components';
import { useHardwareBack, useSlideIn } from '../../hooks';

const VERIFIED_GREEN = '#22c55e';
const UNVERIFIED_AMBER = '#f59e0b';
const DANGER = '#ff453a';
const REVERIFY_INTERVALS = ['30 days', '90 days', '6 months'] as const;
const VERIFIED_TINT = 'rgba(34,197,94,0.12)';
const UNVERIFIED_TINT = 'rgba(245,158,11,0.12)';
const CONTENT_MAX_WIDTH = 560;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// Shields menu: a master Lockdown that arms every shield at once, individual
// shield toggles that flip in place, an event-driven Auto-wipe submenu, and
// destructive actions that confirm + close. Triggers, not Telegram's timers.
const AUTOWIPE_LABELS = ['Off', 'When I close the app', 'When the phone locks'] as const;
// Compact summaries for the collapsed root row so the trailing value stays on
// one line and doesn't overflow the menu.
const AUTOWIPE_SHORT = ['Off', 'On exit', 'On lock'] as const;
// Tallest view (root) drives how many item-animation slots we keep.
const MENU_MAX_ROWS = 8;

type MenuRow = {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  accent?: boolean; // master row (Lockdown) — primary tint, bold
  toggle?: boolean; // trailing On/Off
  value?: string; // trailing muted value
  chevron?: boolean; // trailing › (opens a submenu)
  back?: boolean; // leading ‹ header row
  selected?: boolean; // radio choice in a submenu
};

export function ContactProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId),
  );
  const closeChatProfile = useChatStore((s) => s.closeChatProfile);
  const setConversationVerified = useChatStore((s) => s.setConversationVerified);
  const editContact = useChatStore((s) => s.editContact);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const [muted, setMuted] = useState(false);
  const [headerH, setHeaderH] = useState(insets.top + 64);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [reverifyOn, setReverifyOn] = useState(false);
  const [reverifyIdx, setReverifyIdx] = useState(0);
  const [cloaked, setCloaked] = useState(false);
  const [screenshotGuard, setScreenshotGuard] = useState(false);
  const [receiptBlackout, setReceiptBlackout] = useState(false);
  const [profanityGuard, setProfanityGuard] = useState(false);
  const [autoWipeIdx, setAutoWipeIdx] = useState(0);
  const [menuView, setMenuView] = useState<'root' | 'autowipe'>('root');
  const [menuMounted, setMenuMounted] = useState(false);
  const itemAnims = useRef(
    Array.from({ length: MENU_MAX_ROWS }, () => new Animated.Value(0)),
  ).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  // Cascade the rows in (top → bottom). Re-run on every view switch so the
  // submenu animates in just like the root list.
  const cascadeIn = useCallback(() => {
    itemAnims.forEach((v) => v.setValue(0));
    Animated.stagger(
      42,
      itemAnims.map((v) =>
        Animated.spring(v, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 210,
          mass: 0.6,
        }),
      ),
    ).start();
  }, [itemAnims]);

  const openMenu = useCallback(() => {
    setMenuView('root');
    setMenuMounted(true);
    cardAnim.setValue(0);
    // Pull: the card grows from the top-right while items cascade in.
    Animated.spring(cardAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 16,
      stiffness: 220,
      mass: 0.7,
    }).start();
    cascadeIn();
  }, [cardAnim, cascadeIn]);

  const closeMenu = useCallback(() => {
    // Push back: items leave in reverse and the card shrinks away with them,
    // so no empty card lingers.
    Animated.parallel([
      Animated.timing(cardAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.stagger(
        36,
        [...itemAnims].reverse().map((v) =>
          Animated.timing(v, { toValue: 0, duration: 110, useNativeDriver: true }),
        ),
      ),
    ]).start(({ finished }) => {
      if (finished) {
        setMenuMounted(false);
        setMenuView('root');
      }
    });
  }, [itemAnims, cardAnim]);

  const enterAutowipe = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMenuView('autowipe');
    cascadeIn();
  }, [cascadeIn]);

  const backToRoot = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMenuView('root');
    cascadeIn();
  }, [cascadeIn]);

  const toggleSafety = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSafetyOpen((v) => !v);
  }, []);

  const slide = useSlideIn();
  const onBack = useCallback(() => slide.close(closeChatProfile), [slide, closeChatProfile]);
  useHardwareBack(
    useCallback(() => {
      onBack();
      return true;
    }, [onBack]),
  );

  if (!conversation) return null;

  const verified = conversation.verified;
  const fingerprint = conversation.peerFingerprint
    ? groupHex(conversation.peerFingerprint)
    : '—';
  const safetyNumber = conversation.safetyNumber;
  const statusColor = verified ? VERIFIED_GREEN : UNVERIFIED_AMBER;

  const confirmBlock = () => {
    Alert.alert(
      `Block ${conversation.name}?`,
      'They will no longer be able to message or call you, and they won’t be told.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => undefined },
      ],
    );
  };

  const openEdit = () => {
    setNameDraft(conversation?.name ?? '');
    setPhoneDraft(conversation?.phone ?? '');
    setEditOpen(true);
  };
  const saveEdit = () => {
    if (conversation && nameDraft.trim()) editContact(conversation.id, nameDraft, phoneDraft);
    setEditOpen(false);
  };

  const verifyInPerson = () => {
    Alert.alert(
      'Verify in person',
      `Hold both phones together and scan ${conversation.name}’s QR — or read the safety number aloud. A match means no one is in the middle.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open scanner', onPress: () => undefined },
      ],
    );
  };

  const cycleReverify = () => setReverifyIdx((i) => (i + 1) % REVERIFY_INTERVALS.length);

  const confirmBurn = () => {
    Alert.alert(
      'Burn chat now',
      `Instantly wipe every message and key for ${conversation.name} on this device. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Burn',
          style: 'destructive',
          onPress: () => deleteConversation(conversation.id),
        },
      ],
    );
  };

  const allArmed = cloaked && screenshotGuard && receiptBlackout;
  const armLockdown = () => {
    const next = !allArmed;
    setCloaked(next);
    setScreenshotGuard(next);
    setReceiptBlackout(next);
  };

  const rootRows: MenuRow[] = [
    { key: 'lockdown', icon: 'lucide:shield', label: 'Lockdown', accent: true, toggle: allArmed, onPress: armLockdown },
    { key: 'cloak', icon: 'lucide:eye-off', label: 'Cloak from list', toggle: cloaked, onPress: () => setCloaked((v) => !v) },
    { key: 'screenshot', icon: 'lucide:camera', label: 'Screenshot guard', toggle: screenshotGuard, onPress: () => setScreenshotGuard((v) => !v) },
    { key: 'receipts', icon: 'lucide:check-check', label: 'Hide read receipts', toggle: receiptBlackout, onPress: () => setReceiptBlackout((v) => !v) },
    { key: 'profanity', icon: 'lucide:sparkles', label: 'Profanity guard', toggle: profanityGuard, onPress: () => setProfanityGuard((v) => !v) },
    { key: 'autowipe', icon: 'lucide:hourglass', label: 'Auto-wipe', value: AUTOWIPE_SHORT[autoWipeIdx], chevron: true, onPress: enterAutowipe },
    { key: 'burn', icon: 'lucide:zap', label: 'Burn chat now', danger: true, onPress: () => { closeMenu(); confirmBurn(); } },
    { key: 'block', icon: 'lucide:user-x', label: 'Block contact', danger: true, onPress: () => { closeMenu(); confirmBlock(); } },
  ];

  const autowipeRows: MenuRow[] = [
    { key: 'back', icon: 'lucide:chevron-left', label: 'Auto-wipe', back: true, onPress: backToRoot },
    ...AUTOWIPE_LABELS.map((l, idx) => ({
      key: `aw-${idx}`,
      icon: idx === autoWipeIdx ? 'lucide:circle-check' : 'lucide:circle',
      label: l,
      selected: idx === autoWipeIdx,
      onPress: () => {
        setAutoWipeIdx(idx);
        backToRoot();
      },
    })),
  ];

  const menuRows = menuView === 'autowipe' ? autowipeRows : rootRows;

  return (
    <Animated.View
      style={[styles.flex, { backgroundColor: theme.colors.background }, slide.style]}
    >
      <GlassHeader
        title="Contact info"
        hideAccent
        onHeightChange={setHeaderH}
        leftSlot={
          <IconButton
            icon="lucide:chevron-left"
            size={22}
            onPress={onBack}
            accessibilityLabel="Back"
          />
        }
        rightSlot={
          <>
            <IconButton
              icon="lucide:pencil"
              size={20}
              onPress={openEdit}
              accessibilityLabel="Edit contact"
            />
            <IconButton
              icon="lucide:more-vertical"
              size={22}
              onPress={openMenu}
              accessibilityLabel="More options"
            />
          </>
        }
      />

      <ScrollView
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: headerH,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentWidth, paddingHorizontal: theme.spacing.lg }}>
          <View style={styles.hero}>
            <View style={styles.avatarWrap}>
              <View style={[styles.avatar, { backgroundColor: conversation.avatarColor }]}>
                <Text style={styles.avatarInitial}>
                  {conversation.name[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              {verified ? (
                <View
                  style={[
                    styles.avatarBadge,
                    { backgroundColor: VERIFIED_GREEN, borderColor: theme.colors.background },
                  ]}
                >
                  <Iconify icon="lucide:check" size={14} color="#ffffff" />
                </View>
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              style={[
                theme.typography.heading,
                { color: theme.colors.text, marginTop: theme.spacing.md },
              ]}
            >
              {conversation.name}
            </Text>
            {conversation.phone ? (
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textMuted, marginTop: 2 },
                ]}
              >
                {conversation.phone}
              </Text>
            ) : null}
            <View
              style={[
                styles.statusPill,
                { backgroundColor: verified ? VERIFIED_TINT : UNVERIFIED_TINT },
              ]}
            >
              <Iconify
                icon={verified ? 'lucide:shield-check' : 'lucide:shield-alert'}
                size={14}
                color={statusColor}
              />
              <Text
                style={[
                  theme.typography.caption,
                  { color: statusColor, marginLeft: 5, fontWeight: '600' },
                ]}
              >
                {verified ? 'Verified contact' : 'Not verified'}
              </Text>
            </View>
          </View>

          <View style={[styles.quickRow, { marginTop: theme.spacing.lg }]}>
            <QuickAction
              icon="lucide:message-circle"
              label="Message"
              onPress={onBack}
              theme={theme}
            />
            <QuickAction
              icon={muted ? 'lucide:bell-off' : 'lucide:bell'}
              label={muted ? 'Muted' : 'Mute'}
              active={muted}
              onPress={() => setMuted((v) => !v)}
              theme={theme}
            />
            <QuickAction icon="lucide:search" label="Search" onPress={onBack} theme={theme} />
          </View>

          <SectionLabel label="Trust center" />
          <Card>
            <SettingsRow
              icon={verified ? 'lucide:shield-check' : 'lucide:shield-alert'}
              iconColor={verified ? VERIFIED_GREEN : UNVERIFIED_AMBER}
              label={verified ? 'Verified' : 'Not verified'}
              subtitle={
                verified
                  ? 'You confirmed this contact’s identity.'
                  : 'Compare the safety number to confirm.'
              }
              toggle={{
                value: verified,
                onValueChange: (v) => setConversationVerified(conversation.id, v),
              }}
            />
            <Divider theme={theme} />
            <SettingsRow
              icon="lucide:key-round"
              label="Identity key"
              subtitle={verified ? 'Unchanged since you verified.' : 'Not verified yet.'}
              value={verified ? 'Stable' : '—'}
            />
            <Divider theme={theme} />
            <View style={styles.row}>
              <Iconify icon="lucide:fingerprint" size={18} color={theme.colors.textMuted} />
              <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                <Text style={[theme.typography.body, { color: theme.colors.text }]}>
                  Peer fingerprint
                </Text>
                <Text style={[styles.fingerprint, { color: theme.colors.textMuted, marginTop: 3 }]}>
                  {fingerprint}
                </Text>
              </View>
            </View>
            <Divider theme={theme} />
            <Pressable
              onPress={toggleSafety}
              accessibilityRole="button"
              accessibilityState={{ expanded: safetyOpen }}
              accessibilityLabel="Safety number"
              style={({ pressed }) => [
                styles.row,
                { alignItems: 'center', backgroundColor: pressed ? theme.colors.background : 'transparent' },
              ]}
            >
              <Iconify icon="lucide:lock" size={18} color={theme.colors.textMuted} />
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.text, marginLeft: theme.spacing.md, flex: 1 },
                ]}
              >
                Safety number
              </Text>
              <Iconify
                icon={safetyOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'}
                size={16}
                color={theme.colors.textMuted}
              />
            </Pressable>
            {safetyOpen ? (
              <View style={styles.safetyBody}>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                  Compare these 60 digits with {conversation.name} over a trusted channel.
                  If every block matches, no one is intercepting this session.
                </Text>
                {safetyNumber ? (
                  <SafetyNumberGrid value={safetyNumber} theme={theme} />
                ) : (
                  <Text
                    style={[
                      styles.numberUnavailable,
                      theme.typography.caption,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Not available yet — exchange a message first.
                  </Text>
                )}
              </View>
            ) : null}
            <Divider theme={theme} />
            <SettingsRow
              icon="lucide:camera"
              label="Verify in person"
              subtitle="Scan their QR to confirm the safety number."
              chevron
              onPress={verifyInPerson}
            />
          </Card>

          <View style={{ marginTop: theme.spacing.sm }}>
            <Card>
              <SettingsRow
                icon="lucide:bell"
                label="Re-verify reminder"
                subtitle="Nudge me to re-check their key periodically."
                toggle={{ value: reverifyOn, onValueChange: setReverifyOn }}
              />
              {reverifyOn ? (
                <>
                  <Divider theme={theme} />
                  <SettingsRow
                    icon="lucide:calendar-clock"
                    label="Remind me every"
                    value={REVERIFY_INTERVALS[reverifyIdx]}
                    chevron
                    onPress={cycleReverify}
                  />
                </>
              ) : null}
            </Card>
          </View>
        </View>
      </ScrollView>
      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}
      >
        <Pressable style={styles.editBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable
            onPress={() => undefined}
            style={[
              styles.editCard,
              { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg },
            ]}
          >
            <Text style={[theme.typography.title, { color: theme.colors.text }]}>
              Edit contact
            </Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              placeholder="Name"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="next"
              maxLength={60}
              style={[
                styles.editInput,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                },
              ]}
            />
            <TextInput
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              placeholder="Phone number"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={saveEdit}
              maxLength={24}
              style={[
                styles.editInput,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                  marginTop: 10,
                },
              ]}
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={({ pressed }) => [styles.editBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                disabled={!nameDraft.trim()}
                style={({ pressed }) => [
                  styles.editBtn,
                  { opacity: !nameDraft.trim() ? 0.4 : pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[theme.typography.body, { color: theme.colors.primary, fontWeight: '700' }]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={menuMounted}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
          <Animated.View
            style={[
              styles.menu,
              {
                top: insets.top + 50,
                right: theme.spacing.md,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
                opacity: cardAnim,
                transform: [
                  { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                ],
                transformOrigin: 'top right',
              },
            ]}
          >
            <Pressable onPress={() => undefined}>
            {menuRows.map((row, i) => {
              const tint = row.danger
                ? DANGER
                : row.accent || row.selected
                  ? theme.colors.primary
                  : theme.colors.textMuted;
              const labelColor = row.danger
                ? DANGER
                : row.accent
                  ? theme.colors.primary
                  : theme.colors.text;
              return (
                <Animated.View
                  key={row.key}
                  style={{
                    opacity: itemAnims[i],
                    transform: [
                      {
                        translateY: itemAnims[i].interpolate({
                          inputRange: [0, 1],
                          outputRange: [-8, 0],
                        }),
                      },
                      {
                        scale: itemAnims[i].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.96, 1],
                        }),
                      },
                    ],
                  }}
                >
                  <Pressable
                    onPress={row.onPress}
                    accessibilityRole={row.selected !== undefined ? 'radio' : 'menuitem'}
                    accessibilityState={
                      row.toggle !== undefined
                        ? { selected: row.toggle }
                        : row.selected !== undefined
                          ? { selected: row.selected }
                          : undefined
                    }
                    accessibilityLabel={row.label}
                    style={({ pressed }) => [
                      styles.menuItem,
                      i > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: theme.colors.border,
                      },
                      { backgroundColor: pressed ? theme.colors.background : 'transparent' },
                    ]}
                  >
                    <Iconify icon={row.icon} size={18} color={tint} />
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.body,
                        {
                          color: labelColor,
                          marginLeft: theme.spacing.md,
                          flex: 1,
                          fontWeight: row.accent || row.back ? '700' : '400',
                        },
                      ]}
                    >
                      {row.label}
                    </Text>
                    {row.toggle !== undefined ? (
                      <Text
                        style={[
                          theme.typography.caption,
                          {
                            fontWeight: '700',
                            marginLeft: theme.spacing.md,
                            color: row.toggle ? theme.colors.primary : theme.colors.textMuted,
                          },
                        ]}
                      >
                        {row.toggle ? 'On' : 'Off'}
                      </Text>
                    ) : row.chevron ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: theme.spacing.md }}>
                        {row.value ? (
                          <Text
                            numberOfLines={1}
                            style={[
                              theme.typography.caption,
                              { color: theme.colors.textMuted, marginRight: 4 },
                            ]}
                          >
                            {row.value}
                          </Text>
                        ) : null}
                        <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
                      </View>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </Animated.View>
  );
}

// Prominent tinted button under the hero — the actions people reach for first.
// `active` flips it to a filled state (used by Mute to show it's on).
function QuickAction({
  icon,
  label,
  onPress,
  active,
  theme,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  theme: Theme;
}) {
  const fg = active ? theme.colors.onPrimary : theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.qa,
        {
          backgroundColor: active ? theme.colors.primary : theme.colors.surface,
          borderRadius: theme.radii.lg,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Iconify icon={icon} size={22} color={fg} />
      <Text
        maxFontSizeMultiplier={1.3}
        style={[
          theme.typography.caption,
          { color: active ? theme.colors.onPrimary : theme.colors.text, marginTop: 6, fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// 12 five-digit blocks laid out 4-per-row so each group can be read and
// compared against the peer's screen without losing your place.
function SafetyNumberGrid({ value, theme }: { value: string; theme: Theme }) {
  const groups = value.split(' ').filter(Boolean);
  return (
    <View style={styles.grid}>
      {groups.map((group, i) => (
        <View key={i} style={styles.gridCell}>
          <Text style={[styles.gridText, { color: theme.colors.text }]}>{group}</Text>
        </View>
      ))}
    </View>
  );
}

function groupHex(hex: string): string {
  return hex.replace(/(.{4})(?=.)/g, '$1 ');
}

function Divider({ theme }: { theme: Theme }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.border,
        marginLeft: theme.spacing.md + 18 + theme.spacing.md,
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
  avatarWrap: { width: 96, height: 96 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#ffffff', fontSize: 40, fontWeight: '600' },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  quickRow: { flexDirection: 'row', gap: 10 },
  editBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  editCard: { width: '100%', maxWidth: 360, padding: 20 },
  editInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    marginTop: 16,
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 8 },
  editBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    width: 264,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  qa: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  fingerprint: {
    fontFamily: MONO,
    fontSize: 13,
    letterSpacing: 1,
  },
  safetyBody: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2 },
  numberUnavailable: { marginTop: 14, fontStyle: 'italic' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    marginHorizontal: -4,
  },
  gridCell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  gridText: {
    fontFamily: MONO,
    fontSize: 16,
    letterSpacing: 1.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
