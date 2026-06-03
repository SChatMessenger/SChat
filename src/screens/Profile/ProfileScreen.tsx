import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import LottieView from 'lottie-react-native';
import { StatusBar } from 'expo-status-bar';
import { useAppStore, useBootStore, useIdentityStore } from '../../store';
import { type ThemeOverride } from '../../store/slices/useAppStore';
import { useTheme, type Theme } from '../../theme';
import { useThemeSwitch } from '../../theme/ThemeTransition';
import { GlassHeader, PressableScale } from '../../components';

type MenuKey = 'account' | 'chat' | 'privacy' | 'notifications' | 'data' | 'language' | 'about' | 'help';

const MENU_ITEMS: { key: MenuKey; icon: string; label: string }[] = [
  { key: 'account', icon: 'lucide:key-round', label: 'Account' },
  { key: 'chat', icon: 'lucide:message-circle', label: 'Chat settings' },
  { key: 'privacy', icon: 'lucide:shield', label: 'Privacy & Security' },
  { key: 'notifications', icon: 'lucide:bell', label: 'Notifications' },
  { key: 'data', icon: 'lucide:hard-drive', label: 'Data & Storage' },
  { key: 'language', icon: 'lucide:languages', label: 'Region & Language' },
  { key: 'about', icon: 'lucide:info', label: 'About' },
  { key: 'help', icon: 'lucide:help-circle', label: 'Help' },
];

export function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(insets.top + 76);
  const phone = useIdentityStore((s) => s.phone);
  const switchTheme = useThemeSwitch();
  const displayName = useAppStore((s) => s.displayName);
  const resetBoot = useBootStore((s) => s.reset);
  const resetIdentity = useIdentityStore((s) => s.reset);
  const openAccount = useAppStore((s) => s.openAccount);
  const openChatSettings = useAppStore((s) => s.openChatSettings);
  const openPrivacySecurity = useAppStore((s) => s.openPrivacySecurity);
  const openNotifications = useAppStore((s) => s.openNotifications);
  const openDataStorage = useAppStore((s) => s.openDataStorage);
  const openRegionLanguage = useAppStore((s) => s.openRegionLanguage);
  const handleMenu = (key: MenuKey) => {
    if (key === 'account') openAccount();
    else if (key === 'chat') openChatSettings();
    else if (key === 'privacy') openPrivacySecurity();
    else if (key === 'notifications') openNotifications();
    else if (key === 'data') openDataStorage();
    else if (key === 'language') openRegionLanguage();
  };
  const signOut = () => {
    resetIdentity();
    resetBoot();
  };

  const themeOverride = useAppStore((s) => s.themeOverride);

  // Pick a theme; the circular sunrise/sunset reveal grows from the tapped chip.
  const onSelectTheme = (key: ThemeOverride, e: GestureResponderEvent) => {
    if (key === themeOverride) return;
    switchTheme(key, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  };

  const displayPhone = phone ? formatPhone(phone) : 'not set';
  const initial = (displayName.trim()[0] ?? phone.replace(/\D/g, '').slice(-1) ?? 'Y').toUpperCase();

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <GlassHeader title="Profile" onHeightChange={setHeaderH} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: headerH,
          paddingBottom: 96 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.identityBlock}>
          <View style={[styles.bigAvatar, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.bigInitial, { color: theme.colors.onPrimary }]}>
              {initial}
            </Text>
          </View>
          <Pressable
            onPress={openAccount}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={({ pressed }) => [
              { marginLeft: theme.spacing.md, flex: 1, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={[theme.typography.title, { color: theme.colors.text }]}
            >
              {displayName.trim() || 'Your name'}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              style={[styles.mono, { color: theme.colors.textMuted, marginTop: 2 }]}
            >
              {displayPhone}
            </Text>
          </Pressable>
        </View>

        <Section title="Settings" theme={theme}>
          {MENU_ITEMS.map((item, i) => (
            <View key={item.label}>
              {i > 0 ? (
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: theme.colors.border,
                    marginLeft: theme.spacing.md + 16 + theme.spacing.sm,
                  }}
                />
              ) : null}
              <MenuRow theme={theme} icon={item.icon} label={item.label} onPress={() => handleMenu(item.key)} />
            </View>
          ))}
        </Section>

        <View style={{ marginTop: theme.spacing.lg }}>
          <Text
            style={[
              theme.typography.caption,
              {
                color: theme.colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: theme.spacing.sm,
              },
            ]}
          >
            Appearance
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={[
                theme.typography.body,
                { color: theme.colors.text, flex: 1, marginRight: theme.spacing.md },
              ]}
            >
              {'Always ' + themeOverride + '.'}
            </Text>
            <ThemeToggle value={themeOverride} onSelect={onSelectTheme} />
          </View>
        </View>

        <Section title="Session" theme={theme}>
          <MenuRow theme={theme} icon="lucide:log-out" label="Sign out" onPress={signOut} />
        </Section>
      </ScrollView>

      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <Text
        style={[
          theme.typography.caption,
          {
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: theme.spacing.xs,
          },
        ]}
      >
        {title}
      </Text>
      <View
        style={{
          borderColor: theme.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: theme.radii.md,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

function MenuRow({
  theme,
  icon,
  label,
  onPress,
}: {
  theme: Theme;
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        backgroundColor: pressed ? theme.colors.surface : 'transparent',
      })}
      innerStyle={styles.row}
    >
      <Iconify icon={icon} size={16} color={theme.colors.text} />
      <Text
        style={[
          theme.typography.body,
          { color: theme.colors.text, marginLeft: theme.spacing.sm, flex: 1 },
        ]}
      >
        {label}
      </Text>
      <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
    </PressableScale>
  );
}

// Light / Dark / System segmented control with a thumb that slides between
// chips. Tapping a chip fires the circular theme reveal from that exact point.
const LOTTIE_END = 60; // op of both .lottie clips (0..60 @ 30fps)

// One mounted clip for the active mode. Explicit frame playback driven once the
// native view is laid out (reliable): light plays 0 -> 60 (forward), night
// plays 60 -> 0 (reverse). Mounted via a keyed parent so each switch is a fresh
// "play once" instance.
function ModeLottie({ isLight }: { isLight: boolean }) {
  const ref = useRef<LottieView>(null);
  const played = useRef(false);

  return (
    <LottieView
      ref={ref}
      source={
        isLight
          ? require('../../../assets/mode/light.lottie')
          : require('../../../assets/mode/night.lottie')
      }
      loop={false}
      onLayout={() => {
        if (played.current) return;
        played.current = true;
        if (isLight) ref.current?.play(0, LOTTIE_END);
        else ref.current?.play(LOTTIE_END, 0);
      }}
      style={{ width: 48, height: 48 }}
    />
  );
}

// Tap-to-switch theme icon; keyed by mode so each switch remounts ModeLottie and
// replays in the right direction. Tapping fires the circular reveal from here.
function ThemeToggle({
  value,
  onSelect,
}: {
  value: ThemeOverride;
  onSelect: (key: ThemeOverride, e: GestureResponderEvent) => void;
}) {
  const isLight = value === 'light';
  return (
    <Pressable
      onPress={(e) => onSelect(isLight ? 'dark' : 'light', e)}
      accessibilityRole="button"
      accessibilityState={{ selected: !isLight }}
      accessibilityLabel={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      hitSlop={8}
    >
      <ModeLottie key={isLight ? 'light' : 'night'} isLight={isLight} />
    </Pressable>
  );
}

function formatPhone(p: string) {
  const digits = p.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `+${digits}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identityBlock: { flexDirection: 'row', alignItems: 'center' },
  bigAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigInitial: { fontSize: 24, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 13, letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
