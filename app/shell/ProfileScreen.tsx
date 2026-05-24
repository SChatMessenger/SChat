import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import {
  shortFingerprint,
  useAppStore,
  useBootStore,
  useIdentityStore,
  type ThemeOverride,
} from '../../src/stores';
import { useTheme, type Theme } from '../../src/theme';

const THEME_OPTIONS: { key: ThemeOverride; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const phone = useIdentityStore((s) => s.phone);
  const themeOverride = useAppStore((s) => s.themeOverride);
  const setThemeOverride = useAppStore((s) => s.setThemeOverride);
  const resetBoot = useBootStore((s) => s.reset);
  const resetIdentity = useIdentityStore((s) => s.reset);
  const replayBoot = () => {
    resetIdentity();
    resetBoot();
  };

  const fingerprint = shortFingerprint(phone || 'self');
  const displayPhone = phone ? formatPhone(phone) : 'not set';

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
        }}
      >
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Profile</Text>
        <View
          style={[
            styles.accent,
            { backgroundColor: theme.colors.primary, marginTop: theme.spacing.sm },
          ]}
        />
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg }}>
        <View style={styles.identityBlock}>
          <View style={[styles.bigAvatar, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.bigInitial, { color: theme.colors.onPrimary }]}>
              {(phone.replace(/\D/g, '').slice(-1) || 'Y').toUpperCase()}
            </Text>
          </View>
          <View style={{ marginLeft: theme.spacing.md, flex: 1 }}>
            <Text
              style={[
                theme.typography.title,
                { color: theme.colors.text },
              ]}
            >
              you
            </Text>
            <Text
              style={[
                styles.mono,
                { color: theme.colors.textMuted, marginTop: 2 },
              ]}
            >
              {fingerprint} · {displayPhone}
            </Text>
          </View>
        </View>

        <Section title="Appearance" theme={theme}>
          {THEME_OPTIONS.map((opt) => (
            <RadioOption
              key={opt.key}
              theme={theme}
              active={themeOverride === opt.key}
              label={opt.label}
              onPress={() => setThemeOverride(opt.key)}
            />
          ))}
        </Section>

        <Section title="Session" theme={theme}>
          <ActionRow theme={theme} label="Replay boot" onPress={replayBoot} />
        </Section>
      </View>

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

function RadioOption({
  theme,
  active,
  label,
  onPress,
}: {
  theme: Theme;
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          backgroundColor: pressed ? theme.colors.surface : 'transparent',
        },
      ]}
    >
      {active ? (
        <Iconify icon="lucide:circle-check" size={18} color={theme.colors.primary} />
      ) : (
        <Iconify icon="lucide:circle" size={18} color={theme.colors.border} />
      )}
      <Text
        style={[
          theme.typography.body,
          { color: theme.colors.text, marginLeft: theme.spacing.sm },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActionRow({
  theme,
  label,
  onPress,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          backgroundColor: pressed ? theme.colors.surface : 'transparent',
        },
      ]}
    >
      <Iconify icon="lucide:refresh-cw" size={16} color={theme.colors.text} />
      <Text
        style={[
          theme.typography.body,
          { color: theme.colors.text, marginLeft: theme.spacing.sm, flex: 1 },
        ]}
      >
        {label}
      </Text>
      <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
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
  accent: { width: 28, height: 3, borderRadius: 2 },
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
