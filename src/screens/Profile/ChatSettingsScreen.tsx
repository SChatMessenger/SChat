import { useCallback, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import {
  CHAT_FONT_DEFAULT,
  CHAT_FONT_MAX,
  CHAT_FONT_MIN,
  useAppStore,
  useChatStore,
  type DistanceUnits,
  type ListDensity,
  type VibePreset,
  type VoiceMode,
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
const DANGER = '#ef4444';

const WALLPAPER_COLORS: { key: string; value: string | null; label: string }[] = [
  { key: 'none', value: null, label: 'None' },
  { key: 'cream', value: '#f5f1e8', label: 'Cream' },
  { key: 'sage', value: '#d8e4d8', label: 'Sage' },
  { key: 'sky', value: '#dde9f4', label: 'Sky' },
  { key: 'rose', value: '#f4dde4', label: 'Rose' },
  { key: 'lavender', value: '#e3dcef', label: 'Lavender' },
  { key: 'graphite', value: '#1f2226', label: 'Graphite' },
];

const NAME_COLORS: { key: string; value: string | null; label: string }[] = [
  { key: 'theme', value: null, label: 'Theme' },
  { key: 'blue', value: '#2563eb', label: 'Blue' },
  { key: 'green', value: '#10b981', label: 'Green' },
  { key: 'orange', value: '#f59e0b', label: 'Orange' },
  { key: 'pink', value: '#ec4899', label: 'Pink' },
  { key: 'purple', value: '#a855f7', label: 'Purple' },
  { key: 'cyan', value: '#06b6d4', label: 'Cyan' },
];

const VIBES: { key: VibePreset; label: string; blurb: string }[] = [
  { key: 'casual', label: 'Casual', blurb: 'Cream wallpaper, comfy size, standard list.' },
  { key: 'pro', label: 'Pro', blurb: 'Compact list, no wallpaper, faster reading.' },
  { key: 'cozy', label: 'Cozy', blurb: 'Bigger text, lavender wallpaper, breathing room.' },
];

const DENSITY_OPTS: { key: ListDensity; label: string }[] = [
  { key: 'compact', label: 'Compact' },
  { key: 'standard', label: 'Standard' },
  { key: 'spacious', label: 'Spacious' },
];

const VOICE_OPTS: { key: VoiceMode; label: string; blurb: string }[] = [
  { key: 'hold', label: 'Hold', blurb: 'Press and hold the mic to record.' },
  { key: 'tap', label: 'Tap', blurb: 'Tap to start, tap again to send.' },
];

const UNITS_OPTS: { key: DistanceUnits; label: string }[] = [
  { key: 'km', label: 'km' },
  { key: 'mi', label: 'mi' },
];

export function ChatSettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(insets.top + 64);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  const close = useAppStore((s) => s.closeProfileSubScreen);
  const cs = useAppStore((s) => s.chatSettings);
  const set = useAppStore((s) => s.setChatSetting);
  const applyVibe = useAppStore((s) => s.applyVibe);
  const displayName = useAppStore((s) => s.displayName);

  const conversations = useChatStore((s) => s.conversations);
  const messagesByConversationId = useChatStore((s) => s.messagesByConversationId);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const [busy, setBusy] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);

  const slide = useSlideIn();
  const onBack = useCallback(() => slide.close(close), [slide, close]);

  useHardwareBack(useCallback(() => {
    if (vibeOpen) {
      setVibeOpen(false);
      return true;
    }
    onBack();
    return true;
  }, [vibeOpen, onBack]));

  const vibeOptions: OptionItem<VibePreset>[] = [
    ...VIBES.map((v) => ({ key: v.key, label: v.label, blurb: v.blurb })),
    { key: 'custom' as VibePreset, label: 'Custom', blurb: 'Hand-tuned. Selecting anything below sets this.' },
  ];

  const previewName = displayName.trim() || 'You';
  const nameColor = cs.nameAccentColor ?? theme.colors.primary;
  const previewBg = cs.wallpaperColor ?? theme.colors.surface;

  const clearAll = () => {
    Alert.alert(
      'Clear all chats?',
      `Removes ${conversations.length} conversation${conversations.length === 1 ? '' : 's'} and all messages on this device. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => {
            for (const c of conversations) deleteConversation(c.id);
          },
        },
      ],
    );
  };

  const archiveAll = () => {
    Alert.alert(
      'Archive not implemented',
      'Needs an `archived` flag on Conversation in useChatStore + a filter in ChatListScreen.',
    );
  };

  const exportAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        conversations: conversations.map((c) => ({
          id: c.id,
          name: c.name,
          lastMessage: c.lastMessage,
          lastMessageAt: c.lastMessageAt,
          messages: messagesByConversationId[c.id] ?? [],
        })),
      };
      await Share.share({ title: 'SChat export', message: JSON.stringify(payload, null, 2) });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View style={[styles.flex, { backgroundColor: theme.colors.background }, slide.style]}>
      <GlassHeader
        onHeightChange={setHeaderH}
        title="Chat settings"
        hideAccent
        leftSlot={
          <IconButton
            icon="lucide:chevron-left"
            size={22}
            onPress={onBack}
            accessibilityLabel="Back"
          />
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: 96 + insets.bottom, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentWidth, paddingHorizontal: theme.spacing.lg }}>
          {/* Live preview */}
          <View
            style={{
              backgroundColor: previewBg,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.md,
              marginTop: theme.spacing.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
            }}
          >
            <View style={[styles.bubble, { backgroundColor: theme.colors.background, alignSelf: 'flex-start' }]}>
              <Text style={[styles.bubbleName, { color: nameColor, fontSize: cs.fontSize - 3 }]}>
                Alex
              </Text>
              <Text style={{ fontSize: cs.fontSize, lineHeight: cs.fontSize + 6, color: theme.colors.text }}>
                Hey! How's the new app coming along?
              </Text>
            </View>
            <View
              style={[
                styles.bubble,
                { backgroundColor: theme.colors.primary, alignSelf: 'flex-end', marginTop: theme.spacing.sm },
              ]}
            >
              <Text
                style={{
                  fontSize: cs.fontSize,
                  lineHeight: cs.fontSize + 6,
                  color: theme.colors.onPrimary,
                }}
              >
                Pretty good. Just personalizing it now.
              </Text>
            </View>
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.sm },
              ]}
            >
              Live preview · sender shown as “{previewName}”
            </Text>
          </View>

          {/* Vibe presets */}
          <SectionLabel theme={theme} label="Vibe" />
          <Card theme={theme}>
            <Pressable
              onPress={() => setVibeOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Vibe: ${cs.vibe}. Tap to change.`}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  backgroundColor: pressed ? theme.colors.background : 'transparent',
                },
              ]}
            >
              <Iconify icon="lucide:sparkles" size={18} color={theme.colors.textMuted} />
              <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.body, { color: theme.colors.text, fontWeight: '600' }]}
                >
                  {cs.vibe[0].toUpperCase() + cs.vibe.slice(1)}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
                >
                  {cs.vibe === 'custom'
                    ? 'Hand-tuned. Tap to pick a preset.'
                    : VIBES.find((v) => v.key === cs.vibe)?.blurb}
                </Text>
              </View>
              <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
            </Pressable>
          </Card>

          {/* Look & feel */}
          <SectionLabel theme={theme} label="Look & feel" />
          <Card theme={theme}>
            <FontSizeRow theme={theme} value={cs.fontSize} onChange={(v) => set('fontSize', v)} />
            <SubLabel theme={theme} text="Wallpaper" icon="lucide:image" />
            <Swatches
              theme={theme}
              items={WALLPAPER_COLORS}
              value={cs.wallpaperColor}
              onPress={(v) => set('wallpaperColor', v)}
              emptyGlyph="∅"
            />
            <SubLabel theme={theme} text="Your name color in chats" icon="lucide:palette" />
            <Swatches
              theme={theme}
              items={NAME_COLORS}
              value={cs.nameAccentColor}
              onPress={(v) => set('nameAccentColor', v)}
              emptyGlyph="Aa"
            />
          </Card>

          {/* Lists & gestures */}
          <SectionLabel theme={theme} label="Lists & gestures" />
          <Card theme={theme}>
            <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
              <SubLabel theme={theme} text="Chat list density" icon="lucide:rows" embedded />
              <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
                {DENSITY_OPTS.map((opt) => {
                  const active = cs.listDensity === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => set('listDensity', opt.key)}
                      style={({ pressed }) => [
                        styles.chip,
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
                      <Text
                        maxFontSizeMultiplier={1.2}
                        style={{
                          color: active ? theme.colors.onPrimary : theme.colors.text,
                          fontWeight: '600',
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <ToggleRow
              theme={theme}
              icon="lucide:undo-2"
              label="Swipe to reply"
              caption="Drag a message right to quote it."
              value={cs.swipeToReply}
              onChange={(v) => set('swipeToReply', v)}
            />
          </Card>

          {/* Composer */}
          <SectionLabel theme={theme} label="Composer" />
          <Card theme={theme}>
            <ToggleRow
              theme={theme}
              icon="lucide:corner-down-left"
              label="Enter sends message"
              caption="On hardware keyboards. Off = newline."
              value={cs.enterSends}
              onChange={(v) => set('enterSends', v)}
            />
            <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
              <SubLabel theme={theme} text="Voice messages" icon="lucide:mic" embedded />
              <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
                {VOICE_OPTS.map((opt) => {
                  const active = cs.voiceMode === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => set('voiceMode', opt.key)}
                      style={({ pressed }) => [
                        styles.chip,
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
                      <Text
                        maxFontSizeMultiplier={1.2}
                        style={{
                          color: active ? theme.colors.onPrimary : theme.colors.text,
                          fontWeight: '600',
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.xs }]}
              >
                {VOICE_OPTS.find((o) => o.key === cs.voiceMode)?.blurb}
              </Text>
            </View>
            <ToggleRow
              theme={theme}
              icon="lucide:pause"
              label="Pause music while recording"
              value={cs.pauseMusicOnRecord}
              onChange={(v) => set('pauseMusicOnRecord', v)}
            />
          </Card>

          {/* Privacy & filters */}
          <SectionLabel theme={theme} label="Privacy & filters" />
          <Card theme={theme}>
            <ToggleRow
              theme={theme}
              icon="lucide:check-check"
              label="Read receipts"
              caption="Let contacts see when you've read messages."
              value={cs.readReceipts}
              onChange={(v) => set('readReceipts', v)}
            />
            <ToggleRow
              theme={theme}
              icon="lucide:keyboard"
              label="Typing indicators"
              value={cs.typingIndicators}
              onChange={(v) => set('typingIndicators', v)}
            />
            <ToggleRow
              theme={theme}
              icon="lucide:shield-alert"
              label="Show 18+ content"
              caption="Reveal messages flagged as adult."
              value={cs.adultContent}
              onChange={(v) => set('adultContent', v)}
            />
          </Card>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: theme.spacing.xs, paddingHorizontal: theme.spacing.xs },
            ]}
          >
            Read receipts and typing indicators are preferences only; the wire protocol doesn’t broadcast them yet.
          </Text>

          {/* System & extras */}
          <SectionLabel theme={theme} label="System" />
          <Card theme={theme}>
            <ToggleRow
              theme={theme}
              icon="lucide:globe"
              label="In-app browser"
              caption="Open links inside SChat instead of Safari/Chrome."
              value={cs.inAppBrowser}
              onChange={(v) => set('inAppBrowser', v)}
            />
            <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
              <SubLabel theme={theme} text="Distance units" icon="lucide:ruler" embedded />
              <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
                {UNITS_OPTS.map((opt) => {
                  const active = cs.distanceUnits === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => set('distanceUnits', opt.key)}
                      style={({ pressed }) => [
                        styles.chip,
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
                      <Text
                        maxFontSizeMultiplier={1.2}
                        style={{
                          color: active ? theme.colors.onPrimary : theme.colors.text,
                          fontWeight: '600',
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Card>

          {/* History */}
          <SectionLabel theme={theme} label="Chat history" />
          <Card theme={theme}>
            <ActionRow theme={theme} icon="lucide:archive" label="Archive all chats" onPress={archiveAll} />
            <ActionRow
              theme={theme}
              icon="lucide:share-2"
              label={busy ? 'Exporting…' : 'Export all chats'}
              onPress={exportAll}
            />
            <ActionRow
              theme={theme}
              icon="lucide:trash-2"
              label="Clear all chats"
              onPress={clearAll}
              destructive
            />
          </Card>
        </View>
      </ScrollView>

      <OptionSheet
        visible={vibeOpen}
        title="Vibe"
        options={vibeOptions}
        value={cs.vibe}
        onChange={(v) => {
          if (v === 'custom') {
            setVibeOpen(false);
            return;
          }
          applyVibe(v);
          setVibeOpen(false);
        }}
        onDismiss={() => setVibeOpen(false)}
      />

      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </Animated.View>
  );
}

function SubLabel({
  theme,
  text,
  icon,
  embedded,
}: {
  theme: Theme;
  text: string;
  icon?: string;
  embedded?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: embedded ? 0 : theme.spacing.md,
        paddingTop: embedded ? 0 : theme.spacing.sm,
      }}
    >
      {icon ? <Iconify icon={icon} size={16} color={theme.colors.textMuted} /> : null}
      <Text
        maxFontSizeMultiplier={1.3}
        style={[
          theme.typography.caption,
          { color: theme.colors.textMuted, marginLeft: icon ? theme.spacing.sm : 0 },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function FontSizeRow({
  theme,
  value,
  onChange,
}: {
  theme: Theme;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Iconify icon="lucide:type" size={18} color={theme.colors.textMuted} />
        <Text
          maxFontSizeMultiplier={1.3}
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginLeft: theme.spacing.md, flex: 1 },
          ]}
        >
          Font size
        </Text>
        <Text
          maxFontSizeMultiplier={1.2}
          style={[theme.typography.caption, { color: theme.colors.text, fontWeight: '600' }]}
        >
          {value}
        </Text>
      </View>
      <Slider
        value={value}
        minimumValue={CHAT_FONT_MIN}
        maximumValue={CHAT_FONT_MAX}
        step={1}
        minimumTrackTintColor={theme.colors.primary}
        maximumTrackTintColor={theme.colors.border}
        thumbTintColor={theme.colors.primary}
        onValueChange={(v) => onChange(Math.round(v))}
        style={{ marginTop: theme.spacing.xs }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text maxFontSizeMultiplier={1.2} style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
          {CHAT_FONT_MIN}
        </Text>
        <Pressable onPress={() => onChange(CHAT_FONT_DEFAULT)} hitSlop={8}>
          <Text
            maxFontSizeMultiplier={1.2}
            style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: '600' }]}
          >
            Reset {CHAT_FONT_DEFAULT}
          </Text>
        </Pressable>
        <Text maxFontSizeMultiplier={1.2} style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
          {CHAT_FONT_MAX}
        </Text>
      </View>
    </View>
  );
}

function Swatches({
  theme,
  items,
  value,
  onPress,
  emptyGlyph,
}: {
  theme: Theme;
  items: { key: string; value: string | null; label: string }[];
  value: string | null;
  onPress: (v: string | null) => void;
  emptyGlyph: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.sm,
        gap: theme.spacing.sm,
      }}
    >
      {items.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onPress(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            style={({ pressed }) => [
              styles.swatch,
              {
                backgroundColor: opt.value ?? theme.colors.background,
                borderColor: active ? theme.colors.primary : theme.colors.border,
                borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {opt.value === null ? (
              <Text style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' }}>
                {emptyGlyph}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleRow(p: {
  theme: Theme;
  icon: string;
  label: string;
  caption?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SettingsRow
      icon={p.icon}
      label={p.label}
      subtitle={p.caption}
      toggle={{ value: p.value, onValueChange: p.onChange }}
    />
  );
}

function ActionRow({
  theme,
  icon,
  label,
  onPress,
  destructive,
}: {
  theme: Theme;
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? DANGER : theme.colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          backgroundColor: pressed ? (destructive ? DANGER + '14' : theme.colors.background) : 'transparent',
        },
      ]}
    >
      <Iconify icon={icon} size={18} color={color} />
      <Text
        maxFontSizeMultiplier={1.3}
        style={[
          theme.typography.body,
          { color, marginLeft: theme.spacing.md, flex: 1, fontWeight: destructive ? '600' : '500' },
        ]}
      >
        {label}
      </Text>
      <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  bubbleName: { fontWeight: '700', marginBottom: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
