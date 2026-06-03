import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
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
import {
  useAppStore,
  useContactsStore,
  type AttentionCadence,
  type BreakthroughContact,
  type NotificationSettings,
} from '../../store';
import { useTheme, type Theme } from '../../theme';
import {
  Card,
  GlassHeader,
  IconButton,
  OptionSheet,
  SectionLabel,
  SettingsRow,
  type OptionItem,
} from '../../components';
import { useHardwareBack, useSlideIn } from '../../hooks';

const CONTENT_MAX_WIDTH = 560;

// The Attention Budget — the headline idea. Telegram floods you per-chat; here a
// single dial decides how often anyone OUTSIDE your breakthrough list may
// interrupt, batching the rest into a digest.
const CADENCE: Record<
  AttentionCadence,
  { label: string; chip: string; icon: string; blurb: string }
> = {
  realtime: {
    label: 'Realtime',
    chip: 'Realtime',
    icon: 'lucide:zap',
    blurb: 'Every message pings you the instant it lands.',
  },
  fewMin: {
    label: 'Every few min',
    chip: 'Few min',
    icon: 'lucide:timer',
    blurb: 'Non-priority chats bundle into one ping every few minutes.',
  },
  hourly: {
    label: 'Hourly digest',
    chip: 'Hourly',
    icon: 'lucide:hourglass',
    blurb: 'One digest an hour for everyone outside Breakthrough.',
  },
  silent: {
    label: 'Silent',
    chip: 'Silent',
    icon: 'lucide:bell-off',
    blurb: 'No pings. You check messages on your own time.',
  },
};

const CADENCE_ORDER: AttentionCadence[] = ['realtime', 'fewMin', 'hourly', 'silent'];

const SLEEP_START_OPTS = ['21:00', '22:00', '23:00', '00:00'];
const SLEEP_END_OPTS = ['06:00', '07:00', '08:00', '09:00'];

// Tap-to-add starters for content-aware breakthrough.
const SUGGESTED_KEYWORDS = ['urgent', 'call me', 'asap', 'emergency', 'free?'];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${am ? 'AM' : 'PM'}`;
}

function inSleepWindow(now: Date, start: string, end: string): boolean {
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  if (s < e) return cur >= s && cur < e; // same-day window
  return cur >= s || cur < e; // overnight wrap
}

type LiveState = { label: string; sub: string; icon: string; tint: string };

function computeState(n: NotificationSettings, now: Date, theme: Theme): LiveState {
  if (n.autoSleep && inSleepWindow(now, n.sleepStart, n.sleepEnd)) {
    return {
      label: `Quiet until ${fmtTime(n.sleepEnd)}`,
      sub: 'Sleep hours — muted',
      icon: 'lucide:moon',
      tint: '#a855f7',
    };
  }
  if (n.cadence === 'silent') {
    return { label: 'Silent', sub: 'Everything muted', icon: 'lucide:bell-off', tint: theme.colors.textMuted };
  }
  if (n.cadence === 'hourly' || n.cadence === 'fewMin') {
    return {
      label: CADENCE[n.cadence].label,
      sub: 'Non-priority chats are batched',
      icon: 'lucide:layers',
      tint: theme.colors.primary,
    };
  }
  return { label: 'Active', sub: 'Notifying in realtime', icon: 'lucide:bell', tint: '#10b981' };
}

function breakthroughSummary(list: BreakthroughContact[]): string {
  if (list.length === 0) return 'No one set — everyone obeys the dial below';
  const names = list.map((c) => c.name.split(' ')[0]);
  if (names.length === 1) return `${names[0]} always reaches you`;
  if (names.length === 2) return `${names[0]} & ${names[1]} always reach you`;
  return `${names[0]}, ${names[1]} & ${names.length - 2} more always reach you`;
}

export function NotificationsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  const close = useAppStore((s) => s.closeProfileSubScreen);
  const n = useAppStore((s) => s.notifications);
  const set = useAppStore((s) => s.setNotification);
  const removeBreakthrough = useAppStore((s) => s.removeBreakthrough);
  const addKeyword = useAppStore((s) => s.addBreakthroughKeyword);
  const removeKeyword = useAppStore((s) => s.removeBreakthroughKeyword);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [sleepEdit, setSleepEdit] = useState<null | 'start' | 'end'>(null);

  const submitKeyword = () => {
    addKeyword(keywordDraft);
    setKeywordDraft('');
  };

  // Re-tick so the live "state now" banner stays honest as the clock crosses
  // the sleep window without needing the user to reopen the screen.
  const [now, setNow] = useState(() => new Date());
  const [headerH, setHeaderH] = useState(insets.top + 64);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const slide = useSlideIn();
  const onBack = useCallback(() => slide.close(close), [slide, close]);

  useHardwareBack(
    useCallback(() => {
      if (pickerOpen) {
        setPickerOpen(false);
        return true;
      }
      if (sleepEdit) {
        setSleepEdit(null);
        return true;
      }
      onBack();
      return true;
    }, [pickerOpen, sleepEdit, onBack]),
  );

  const live = computeState(n, now, theme);

  const explain = () => {
    const lines = [
      `Right now: ${live.label}.`,
      '',
      n.breakthrough.length > 0
        ? `• ${n.breakthrough.length} Breakthrough ${n.breakthrough.length === 1 ? 'person' : 'people'} always notify you, even in sleep or focus.`
        : '• No Breakthrough people yet — add some so the right messages always land.',
      n.breakthroughKeywords.length > 0
        ? `• Messages saying ${n.breakthroughKeywords.slice(0, 3).map((k) => `“${k}”`).join(', ')} break through from anyone.`
        : '• No breakthrough words set.',
      `• Everyone else: ${CADENCE[n.cadence].blurb}`,
      n.autoSleep
        ? `• Auto-switch muted you ${fmtTime(n.sleepStart)}–${fmtTime(n.sleepEnd)}.`
        : '• Auto-switch for sleep is off.',
    ];
    Alert.alert('Why you got (or didn’t get) that', lines.join('\n'));
  };

  const timeOptions = (opts: string[]): OptionItem<string>[] =>
    opts.map((t) => ({ key: t, label: fmtTime(t) }));

  return (
    <Animated.View style={[styles.flex, { backgroundColor: theme.colors.background }, slide.style]}>
      <GlassHeader
        onHeightChange={setHeaderH}
        title="Notifications"
        hideAccent
        leftSlot={
          <IconButton icon="lucide:chevron-left" size={22} onPress={onBack} accessibilityLabel="Back" />
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: 96 + insets.bottom, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentWidth, paddingHorizontal: theme.spacing.lg }}>
          {/* Live state banner — adaptive, the opposite of a static toggle list */}
          <View
            style={{
              marginTop: theme.spacing.md,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: live.tint + '22',
                }}
              >
                <Iconify icon={live.icon} size={20} color={live.tint} />
              </View>
              <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.body, { color: theme.colors.text, fontWeight: '700' }]}
                >
                  {live.label}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
                >
                  {live.sub}
                </Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: theme.spacing.sm,
              }}
            >
              <Iconify icon="lucide:zap" size={14} color={theme.colors.textMuted} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.caption, { color: theme.colors.textMuted, marginLeft: theme.spacing.sm, flex: 1 }]}
              >
                {breakthroughSummary(n.breakthrough)}
              </Text>
            </View>
          </View>

          {/* Breakthrough list */}
          <SectionLabel theme={theme} label="Breakthrough" />
          <Card theme={theme}>
            {n.breakthrough.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider theme={theme} /> : null}
                <View style={styles.personRow}>
                  <View
                    style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
                  >
                    <Text style={[styles.avatarInitial, { color: theme.colors.onPrimary }]}>
                      {(c.name.trim()[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    style={[
                      theme.typography.body,
                      { color: theme.colors.text, flex: 1, marginLeft: theme.spacing.md },
                    ]}
                  >
                    {c.name}
                  </Text>
                  <Pressable
                    onPress={() => removeBreakthrough(c.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${c.name} from breakthrough`}
                  >
                    <Iconify icon="lucide:x" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            ))}
            {n.breakthrough.length > 0 ? <Divider theme={theme} /> : null}
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add breakthrough people"
              style={({ pressed }) => [
                styles.addRow,
                {
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                  backgroundColor: pressed ? theme.colors.background : 'transparent',
                },
              ]}
            >
              <Iconify icon="lucide:user-plus" size={18} color={theme.colors.primary} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.body, { color: theme.colors.primary, marginLeft: theme.spacing.md, fontWeight: '600' }]}
              >
                Add people
              </Text>
            </Pressable>
          </Card>
          <Caption theme={theme}>
            These people always notify you — even when you’re silent, asleep, or in focus.
          </Caption>

          {/* Smart breakthrough — content-aware, not just people. No other
              messenger lets a *word* punch through a muted chat. */}
          <View style={{ marginTop: theme.spacing.sm }}>
            <Card theme={theme}>
              <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Iconify icon="lucide:type" size={18} color={theme.colors.textMuted} />
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={[
                      theme.typography.body,
                      { color: theme.colors.text, fontWeight: '600', marginLeft: theme.spacing.md },
                    ]}
                  >
                    Words that always reach you
                  </Text>
                </View>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
                >
                  Any message containing one breaks through — even from a muted chat.
                </Text>

                {n.breakthroughKeywords.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                    {n.breakthroughKeywords.map((k) => (
                      <Pressable
                        key={k}
                        onPress={() => removeKeyword(k)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove keyword ${k}`}
                        style={[styles.keywordChip, { backgroundColor: theme.colors.primary + '1a', borderColor: theme.colors.primary }]}
                      >
                        <Text maxFontSizeMultiplier={1.2} style={{ color: theme.colors.primary, fontWeight: '600' }}>
                          {k}
                        </Text>
                        <Iconify icon="lucide:x" size={12} color={theme.colors.primary} style={{ marginLeft: 6 }} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
                  <TextInput
                    value={keywordDraft}
                    onChangeText={setKeywordDraft}
                    onSubmitEditing={submitKeyword}
                    placeholder="Add a word…"
                    placeholderTextColor={theme.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    maxFontSizeMultiplier={1.3}
                    style={[
                      theme.typography.body,
                      {
                        flex: 1,
                        color: theme.colors.text,
                        backgroundColor: theme.colors.background,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radii.md,
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: theme.spacing.sm,
                      },
                    ]}
                  />
                  <Pressable
                    onPress={submitKeyword}
                    accessibilityRole="button"
                    accessibilityLabel="Add keyword"
                    style={({ pressed }) => [
                      styles.keywordAdd,
                      {
                        backgroundColor: theme.colors.primary,
                        opacity: pressed || !keywordDraft.trim() ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Iconify icon="lucide:plus" size={18} color={theme.colors.onPrimary} />
                  </Pressable>
                </View>

                {n.breakthroughKeywords.length === 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                    {SUGGESTED_KEYWORDS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => addKeyword(s)}
                        accessibilityRole="button"
                        accessibilityLabel={`Add suggested keyword ${s}`}
                        style={[styles.keywordChip, { borderColor: theme.colors.border }]}
                      >
                        <Iconify icon="lucide:plus" size={12} color={theme.colors.textMuted} />
                        <Text maxFontSizeMultiplier={1.2} style={{ color: theme.colors.text, marginLeft: 4 }}>
                          {s}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </Card>
          </View>

          {/* Attention Budget */}
          <SectionLabel theme={theme} label="Attention Budget" />
          <Card theme={theme}>
            <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md }}>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.body, { color: theme.colors.text, fontWeight: '600' }]}
              >
                Everyone else
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
              >
                How often non-priority chats may interrupt you.
              </Text>
              <View style={{ flexDirection: 'row', marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
                {CADENCE_ORDER.map((key) => {
                  const active = n.cadence === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => set('cadence', key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.cadenceChip,
                        {
                          backgroundColor: active
                            ? theme.colors.primary
                            : pressed
                              ? theme.colors.background
                              : 'transparent',
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Iconify
                        icon={CADENCE[key].icon}
                        size={16}
                        color={active ? theme.colors.onPrimary : theme.colors.textMuted}
                      />
                      <Text
                        maxFontSizeMultiplier={1.1}
                        style={{
                          color: active ? theme.colors.onPrimary : theme.colors.text,
                          fontWeight: '600',
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        {CADENCE[key].chip}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: theme.spacing.md,
                  backgroundColor: theme.colors.background,
                  borderRadius: theme.radii.md,
                  padding: theme.spacing.sm,
                }}
              >
                <Iconify icon="lucide:info" size={16} color={theme.colors.primary} />
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.caption, { color: theme.colors.text, marginLeft: theme.spacing.sm, flex: 1 }]}
                >
                  {CADENCE[n.cadence].blurb}
                </Text>
              </View>
            </View>
          </Card>

          {/* Auto-switch */}
          <SectionLabel theme={theme} label="Auto-switch" />
          <Card theme={theme}>
            <ToggleRow
              theme={theme}
              icon="lucide:moon"
              label="Sleep hours"
              caption="Mute non-priority chats overnight."
              value={n.autoSleep}
              onChange={(v) => set('autoSleep', v)}
            />
            {n.autoSleep ? (
              <View style={{ flexDirection: 'row', paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
                <TimePill theme={theme} label="From" value={fmtTime(n.sleepStart)} onPress={() => setSleepEdit('start')} />
                <TimePill theme={theme} label="To" value={fmtTime(n.sleepEnd)} onPress={() => setSleepEdit('end')} />
              </View>
            ) : null}
            <Divider theme={theme} />
            <ToggleRow
              theme={theme}
              icon="lucide:calendar-clock"
              label="During calendar events"
              caption="Go quiet while an event is in progress."
              value={n.autoCalendar}
              onChange={(v) => set('autoCalendar', v)}
            />
            <Divider theme={theme} />
            <ToggleRow
              theme={theme}
              icon="lucide:circle-dot"
              label="Match system Focus"
              caption="Follow iOS / Android Do-Not-Disturb."
              value={n.autoFocus}
              onChange={(v) => set('autoFocus', v)}
            />
          </Card>
          <Caption theme={theme}>
            SChat changes its own state from these signals, so you don’t toggle anything by hand. Breakthrough people are exempt.
          </Caption>

          {/* Notify me about — granular per-surface sources */}
          <SectionLabel theme={theme} label="Notify me about" />
          <Card theme={theme}>
            <ToggleRow
              theme={theme}
              icon="lucide:user-round"
              label="All accounts"
              caption="Master switch across every signed-in account."
              value={n.allAccounts}
              onChange={(v) => set('allAccounts', v)}
            />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:message-circle" label="Private chats" value={n.privateChats} onChange={(v) => set('privateChats', v)} disabled={!n.allAccounts} />
            <Divider theme={theme} />
            <GroupRow theme={theme} icon="lucide:users" label="Groups" />
            <ToggleRow theme={theme} icon="lucide:lock" label="Private" value={n.groupsPrivate} onChange={(v) => set('groupsPrivate', v)} disabled={!n.allAccounts} indent />
            <ToggleRow theme={theme} icon="lucide:globe" label="Public" value={n.groupsPublic} onChange={(v) => set('groupsPublic', v)} disabled={!n.allAccounts} indent />
            <GroupRow theme={theme} icon="lucide:megaphone" label="Channels" />
            <ToggleRow theme={theme} icon="lucide:lock" label="Private" value={n.channelsPrivate} onChange={(v) => set('channelsPrivate', v)} disabled={!n.allAccounts} indent />
            <ToggleRow theme={theme} icon="lucide:globe" label="Public" value={n.channelsPublic} onChange={(v) => set('channelsPublic', v)} disabled={!n.allAccounts} indent />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:radio" label="Stories" value={n.stories} onChange={(v) => set('stories', v)} disabled={!n.allAccounts} />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:heart" label="Reactions" value={n.reactions} onChange={(v) => set('reactions', v)} disabled={!n.allAccounts} />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:pin" label="Pinned messages" value={n.pinnedMessages} onChange={(v) => set('pinnedMessages', v)} disabled={!n.allAccounts} />
          </Card>
          <Caption theme={theme}>
            Global sources you can mute independently. Breakthrough people and the Attention Budget still apply on top.
          </Caption>

          {/* Delivery — sound / vibration / preview plumbing */}
          <SectionLabel theme={theme} label="Delivery" />
          <Card theme={theme}>
            <ToggleRow theme={theme} icon="lucide:volume-2" label="Sound" value={n.sound} onChange={(v) => set('sound', v)} />
            <Divider theme={theme} />
            <ToggleRow theme={theme} icon="lucide:vibrate" label="Vibrate" value={n.vibrate} onChange={(v) => set('vibrate', v)} />
            <Divider theme={theme} />
            <ToggleRow
              theme={theme}
              icon="lucide:music"
              label="In-chat sounds"
              caption="Send / receive blips while a chat is open."
              value={n.chatSound}
              onChange={(v) => set('chatSound', v)}
            />
            <Divider theme={theme} />
            <ToggleRow
              theme={theme}
              icon="lucide:eye"
              label="Message preview"
              caption="Show message text on the lock screen."
              value={n.preview}
              onChange={(v) => set('preview', v)}
            />
            <Divider theme={theme} />
            <ToggleRow
              theme={theme}
              icon="lucide:badge"
              label="Badge count"
              caption="Unread number on the app icon."
              value={n.badge}
              onChange={(v) => set('badge', v)}
            />
          </Card>

          {/* Why did I get this? — the feedback loop Telegram lacks */}
          <Pressable
            onPress={explain}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.whyRow,
              {
                marginTop: theme.spacing.lg,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.md,
                backgroundColor: pressed ? theme.colors.surface : 'transparent',
              },
            ]}
          >
            <Iconify icon="lucide:help-circle" size={18} color={theme.colors.text} />
            <Text
              maxFontSizeMultiplier={1.3}
              style={[theme.typography.body, { color: theme.colors.text, marginLeft: theme.spacing.md, flex: 1 }]}
            >
              Why did I get that notification?
            </Text>
            <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
          </Pressable>

          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.xs, lineHeight: theme.typography.caption.lineHeight + 2 },
            ]}
          >
            Preferences persist locally. Actually delivering, batching, and silencing pushes needs a push service + server-side routing that honors these rules.
          </Text>
        </View>
      </ScrollView>

      <BreakthroughPicker visible={pickerOpen} onDismiss={() => setPickerOpen(false)} />

      <OptionSheet
        visible={sleepEdit === 'start'}
        title="Sleep starts"
        options={timeOptions(SLEEP_START_OPTS)}
        value={n.sleepStart}
        onChange={(v) => {
          set('sleepStart', v);
          setSleepEdit(null);
        }}
        onDismiss={() => setSleepEdit(null)}
      />
      <OptionSheet
        visible={sleepEdit === 'end'}
        title="Sleep ends"
        options={timeOptions(SLEEP_END_OPTS)}
        value={n.sleepEnd}
        onChange={(v) => {
          set('sleepEnd', v);
          setSleepEdit(null);
        }}
        onDismiss={() => setSleepEdit(null)}
      />

      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </Animated.View>
  );
}

// Contact picker for the breakthrough list. Pulls registered contacts from the
// shared store (syncing on first open) and toggles membership inline.
function BreakthroughPicker({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const breakthrough = useAppStore((s) => s.notifications.breakthrough);
  const toggle = useAppStore((s) => s.toggleBreakthrough);

  const contacts = useContactsStore((s) => s.contacts);
  const loading = useContactsStore((s) => s.loading);
  const permissionDenied = useContactsStore((s) => s.permissionDenied);
  const error = useContactsStore((s) => s.error);
  const syncContacts = useContactsStore((s) => s.syncContacts);

  useEffect(() => {
    if (visible) void syncContacts();
  }, [visible, syncContacts]);

  const registered = contacts.filter((c) => c.status === 'registered');
  const selected = new Set(breakthrough.map((c) => c.id));

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable onPress={onDismiss} style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12) + theme.spacing.sm,
            maxHeight: '76%',
          }}
        >
          <View
            style={{
              width: 44,
              height: 5,
              borderRadius: 3,
              backgroundColor: theme.colors.border,
              alignSelf: 'center',
              marginBottom: theme.spacing.md,
            }}
          />
          <Text
            maxFontSizeMultiplier={1.3}
            style={[theme.typography.title, { color: theme.colors.text, paddingHorizontal: theme.spacing.lg }]}
          >
            Always reach you
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[theme.typography.caption, { color: theme.colors.textMuted, paddingHorizontal: theme.spacing.lg, marginTop: 2, marginBottom: theme.spacing.sm }]}
          >
            Tap people who should break through every time.
          </Text>

          {loading && registered.length === 0 ? (
            <View style={styles.pickerState}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
                Loading contacts…
              </Text>
            </View>
          ) : permissionDenied ? (
            <View style={styles.pickerState}>
              <Iconify icon="lucide:contact" size={28} color={theme.colors.textMuted} />
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm, textAlign: 'center', paddingHorizontal: theme.spacing.lg }]}>
                Contacts permission is off. Enable it in Settings to pick people.
              </Text>
            </View>
          ) : registered.length === 0 ? (
            <View style={styles.pickerState}>
              <Iconify icon="lucide:users" size={28} color={theme.colors.textMuted} />
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm, textAlign: 'center', paddingHorizontal: theme.spacing.lg }]}>
                {error ?? 'No contacts on SChat yet to add.'}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {registered.map((c) => {
                const active = selected.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggle({ id: c.id, name: c.name })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.personRow,
                      { backgroundColor: pressed ? theme.colors.surface : 'transparent' },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
                      <Text style={[styles.avatarInitial, { color: theme.colors.onPrimary }]}>
                        {(c.name.trim()[0] ?? '?').toUpperCase()}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.3}
                      style={[theme.typography.body, { color: theme.colors.text, flex: 1, marginLeft: theme.spacing.md }]}
                    >
                      {c.name}
                    </Text>
                    <Iconify
                      icon={active ? 'lucide:circle-check' : 'lucide:circle'}
                      size={20}
                      color={active ? theme.colors.primary : theme.colors.border}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Caption({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      style={[
        theme.typography.caption,
        {
          color: theme.colors.textMuted,
          marginTop: theme.spacing.xs,
          paddingHorizontal: theme.spacing.xs,
          lineHeight: theme.typography.caption.lineHeight + 2,
        },
      ]}
    >
      {children}
    </Text>
  );
}

// Row dividers intentionally disabled — rows separate by their own padding for a
// cleaner, borderless grouped look. Kept as a no-op so call sites stay valid.
function Divider(_props: { theme: Theme }) {
  return null;
}

// Non-interactive parent label for a group of indented sub-rows (Groups,
// Channels), so the Private/Public toggles read as a hierarchy.
function GroupRow({ theme, icon, label }: { theme: Theme; icon: string; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        paddingBottom: 2,
      }}
    >
      <Iconify icon={icon} size={18} color={theme.colors.textMuted} />
      <Text
        maxFontSizeMultiplier={1.3}
        style={[
          theme.typography.body,
          { color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '600', marginLeft: theme.spacing.md },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function TimePill({
  theme,
  label,
  value,
  onPress,
}: {
  theme: Theme;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      style={({ pressed }) => [
        styles.timePill,
        { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.background : 'transparent' },
      ]}
    >
      <Text maxFontSizeMultiplier={1.2} style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1.2}
        style={[theme.typography.body, { color: theme.colors.text, fontWeight: '600', marginLeft: theme.spacing.sm }]}
      >
        {value}
      </Text>
      <Iconify icon="lucide:chevron-down" size={14} color={theme.colors.textMuted} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

function ToggleRow(p: {
  theme: Theme;
  icon: string;
  label: string;
  caption?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  indent?: boolean;
}) {
  return (
    <SettingsRow
      compact
      icon={p.icon}
      label={p.label}
      subtitle={p.caption}
      indent={p.indent}
      disabled={p.disabled}
      toggle={{ value: p.value, onValueChange: p.onChange }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addRow: { flexDirection: 'row', alignItems: 'center' },
  whyRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 15, fontWeight: '700' },
  cadenceChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  keywordAdd: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
