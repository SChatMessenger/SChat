import { useCallback, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { StatusBar } from 'expo-status-bar';
import {
  useAppStore,
  type Audience,
  type PrivacyPersona,
  type PrivacySettings,
  type SecuritySettings,
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
const WARN = '#f59e0b';
const OK = '#10b981';

const PERSONAS: { key: PrivacyPersona; label: string; blurb: string }[] = [
  { key: 'public',  label: 'Public',  blurb: 'Everything public. Good for creators.' },
  { key: 'friends', label: 'Contacts', blurb: 'Sensitive details for contacts only.' },
  { key: 'private', label: 'Private', blurb: 'Locked down. Most fields private, rest contacts only.' },
];

const AUDIENCE_OPTS: { key: Audience; label: string; icon: string }[] = [
  { key: 'everyone', label: 'Public',   icon: 'lucide:globe' },
  { key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
  { key: 'nobody',   label: 'Private',  icon: 'lucide:eye-off' },
];

const SEEN_ROWS: { key: keyof PrivacySettings; icon: string; label: string; sub?: string }[] = [
  { key: 'profilePhoto', icon: 'lucide:user',          label: 'Profile photo' },
  { key: 'bio',          icon: 'lucide:align-left',    label: 'Bio' },
  { key: 'birthday',     icon: 'lucide:cake',          label: 'Birthday' },
  { key: 'lastSeen',     icon: 'lucide:clock',         label: 'Last seen' },
  { key: 'onlineStatus', icon: 'lucide:circle-dot',    label: 'Online status' },
  { key: 'music',        icon: 'lucide:music',         label: 'Saved music' },
];

const REACH_ROWS: { key: keyof PrivacySettings; icon: string; label: string }[] = [
  { key: 'messages',      icon: 'lucide:message-circle', label: 'Send you messages' },
  { key: 'calls',         icon: 'lucide:phone',          label: 'Call you' },
  { key: 'voiceMessages', icon: 'lucide:mic',            label: 'Send voice messages' },
  { key: 'forwards',      icon: 'lucide:forward',        label: 'Forward your messages' },
  { key: 'groupInvites',  icon: 'lucide:users',          label: 'Add you to groups' },
  { key: 'gifts',         icon: 'lucide:gift',           label: 'Send gifts' },
];

function strengthOf(s: SecuritySettings): { score: number; label: string; color: string } {
  let n = 0;
  if (s.twoFactor) n++;
  if (s.appPasscode) n++;
  if (s.passkeys) n++;
  if (s.autoDeleteDays > 0) n++;
  if (n <= 1) return { score: n, label: 'Weak',    color: DANGER };
  if (n === 2) return { score: n, label: 'Decent', color: WARN };
  if (n === 3) return { score: n, label: 'Strong', color: OK };
  return { score: n, label: 'Maxed', color: OK };
}

export function PrivacySecurityScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(insets.top + 64);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  const close = useAppStore((s) => s.closeProfileSubScreen);
  const privacy = useAppStore((s) => s.privacy);
  const security = useAppStore((s) => s.security);
  const setPrivacy = useAppStore((s) => s.setPrivacy);
  const setSecurity = useAppStore((s) => s.setSecurity);
  const applyPersona = useAppStore((s) => s.applyPrivacyPersona);

  const [picker, setPicker] = useState<{ key: keyof PrivacySettings; label: string } | null>(null);
  const [personaOpen, setPersonaOpen] = useState(false);

  const slide = useSlideIn();
  const onBack = useCallback(() => slide.close(close), [slide, close]);

  useHardwareBack(useCallback(() => {
    if (picker) {
      setPicker(null);
      return true;
    }
    if (personaOpen) {
      setPersonaOpen(false);
      return true;
    }
    onBack();
    return true;
  }, [picker, personaOpen, onBack]));

  const strength = strengthOf(security);
  const stub = (what: string) =>
    Alert.alert(`${what}`, `Not implemented — would need a dedicated flow + server protocol support.`);

  const openExceptions = (label: string) => {
    setPicker(null);
    Alert.alert(
      `${label} — exceptions`,
      'Set Always allow (specific people see this regardless of audience) and Never allow (specific people blocked regardless). Needs a contact picker — wire one through useContactsStore to enable.',
    );
  };

  const audienceOptions: OptionItem<Audience>[] = AUDIENCE_OPTS.map((o) => ({
    key: o.key,
    label: o.label,
    icon: o.icon,
  }));
  const personaOptions: OptionItem<PrivacyPersona>[] = [
    ...PERSONAS.map((p) => ({ key: p.key, label: p.label, blurb: p.blurb })),
    { key: 'custom' as PrivacyPersona, label: 'Custom', blurb: 'Hand-tuned. Selecting any field below sets this.' },
  ];

  return (
    <Animated.View style={[styles.flex, { backgroundColor: theme.colors.background }, slide.style]}>
      <GlassHeader
        onHeightChange={setHeaderH}
        title="Privacy & Security"
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
          {/* Security strength meter */}
          <View
            style={{
              marginTop: theme.spacing.md,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Iconify icon="lucide:shield-check" size={20} color={strength.color} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={[
                  theme.typography.body,
                  { color: theme.colors.text, marginLeft: theme.spacing.sm, fontWeight: '700', flex: 1 },
                ]}
              >
                Security: {strength.label}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                {strength.score}/4
              </Text>
            </View>
            <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm, gap: 4 }}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i < strength.score ? strength.color : theme.colors.border,
                  }}
                />
              ))}
            </View>
            <Text
              maxFontSizeMultiplier={1.3}
              style={[
                theme.typography.caption,
                { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
              ]}
            >
              {strength.score < 4
                ? 'Boost it by enabling 2FA, a passcode, passkeys, and auto-delete below.'
                : 'You\'ve enabled every account-level guard. Nice.'}
            </Text>
          </View>

          {/* Privacy persona */}
          <SectionLabel theme={theme} label="Privacy persona" />
          <Card theme={theme}>
            <Pressable
              onPress={() => setPersonaOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Privacy persona: ${privacy.persona}. Tap to change.`}
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
              <Iconify icon="lucide:shield" size={18} color={theme.colors.textMuted} />
              <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.body, { color: theme.colors.text, fontWeight: '600' }]}
                >
                  {privacy.persona[0].toUpperCase() + privacy.persona.slice(1)}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
                >
                  {privacy.persona === 'custom'
                    ? 'Hand-tuned. Tap to pick a preset.'
                    : PERSONAS.find((p) => p.key === privacy.persona)?.blurb}
                </Text>
              </View>
              <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
            </Pressable>
          </Card>

          {/* What others see */}
          <SectionLabel theme={theme} label="What others see" />
          <Card theme={theme}>
            {SEEN_ROWS.map((r, i) => (
              <AudienceRow
                key={r.key}
                theme={theme}
                icon={r.icon}
                label={r.label}
                value={privacy[r.key] as Audience}
                onOpen={() => setPicker({ key: r.key, label: r.label })}
                showDivider={i > 0}
              />
            ))}
          </Card>

          {/* Who can reach you */}
          <SectionLabel theme={theme} label="Who can reach you" />
          <Card theme={theme}>
            {REACH_ROWS.map((r, i) => (
              <AudienceRow
                key={r.key}
                theme={theme}
                icon={r.icon}
                label={r.label}
                value={privacy[r.key] as Audience}
                onOpen={() => setPicker({ key: r.key, label: r.label })}
                showDivider={i > 0}
              />
            ))}
          </Card>

          {/* Account security */}
          <SectionLabel theme={theme} label="Account security" />
          <Card theme={theme}>
            <ToggleRow
              theme={theme}
              icon="lucide:key-round"
              label="Two-step verification"
              caption="Require a PIN at login on a new device."
              value={security.twoFactor}
              onChange={(v) => {
                if (v) stub('Two-step verification');
                setSecurity('twoFactor', v);
              }}
            />
            <ToggleRow
              theme={theme}
              icon="lucide:lock"
              label="App passcode"
              caption="Lock the app behind a 4-6 digit code."
              value={security.appPasscode}
              onChange={(v) => {
                if (v) stub('App passcode');
                setSecurity('appPasscode', v);
              }}
            />
            <ToggleRow
              theme={theme}
              icon="lucide:fingerprint"
              label="Passkeys"
              caption="Sign in with FaceID / fingerprint / hardware key."
              value={security.passkeys}
              onChange={(v) => {
                if (v) stub('Passkeys');
                setSecurity('passkeys', v);
              }}
            />
            <ActionRow
              theme={theme}
              icon="lucide:timer"
              label="Auto-delete messages"
              value={security.autoDeleteDays > 0 ? `After ${security.autoDeleteDays}d` : 'Off'}
              onPress={() => stub('Auto-delete messages')}
            />
            <ActionRow
              theme={theme}
              icon="lucide:user-x"
              label="Blocked users"
              value={`${security.blockedCount}`}
              onPress={() => stub('Blocked users')}
            />
            <ActionRow
              theme={theme}
              icon="lucide:smartphone"
              label="Active devices"
              value={`${security.activeDevices}`}
              onPress={() => stub('Active devices')}
            />
          </Card>
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
            Toggles persist locally; flows like 2FA setup, passcode entry, blocked user management, and device list need dedicated screens + server protocol support.
          </Text>
        </View>
      </ScrollView>

      <OptionSheet
        visible={!!picker}
        title={picker?.label ?? ''}
        options={audienceOptions}
        value={picker ? (privacy[picker.key] as Audience) : null}
        onChange={(v) => {
          if (picker) setPrivacy(picker.key, v as PrivacySettings[typeof picker.key]);
          setPicker(null);
        }}
        onDismiss={() => setPicker(null)}
        footer={{
          icon: 'lucide:user-plus',
          label: 'Always allow / Never allow',
          onPress: () => picker && openExceptions(picker.label),
        }}
      />
      <OptionSheet
        visible={personaOpen}
        title="Privacy persona"
        options={personaOptions}
        value={privacy.persona}
        onChange={(v) => {
          if (v === 'custom') {
            setPersonaOpen(false);
            return;
          }
          applyPersona(v);
          setPersonaOpen(false);
        }}
        onDismiss={() => setPersonaOpen(false)}
      />

      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </Animated.View>
  );
}


function AudienceRow({
  theme,
  icon,
  label,
  value,
  onOpen,
  showDivider,
}: {
  theme: Theme;
  icon: string;
  label: string;
  value: Audience;
  onOpen: () => void;
  showDivider?: boolean;
}) {
  const opt = AUDIENCE_OPTS.find((o) => o.key === value)!;
  return (
    <View>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${opt.label}. Tap to change.`}
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
        <Iconify icon={icon} size={18} color={theme.colors.textMuted} />
        <Text
          maxFontSizeMultiplier={1.3}
          style={[
            theme.typography.body,
            { color: theme.colors.text, marginLeft: theme.spacing.md, flex: 1 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <View
          style={[
            styles.valuePill,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <Iconify icon={opt.icon} size={14} color={theme.colors.text} />
          <Text
            maxFontSizeMultiplier={1.2}
            style={[
              theme.typography.caption,
              { color: theme.colors.text, marginLeft: 6, fontWeight: '600' },
            ]}
          >
            {opt.label}
          </Text>
          <Iconify
            icon="lucide:chevron-right"
            size={12}
            color={theme.colors.textMuted}
            style={{ marginLeft: 6 }}
          />
        </View>
      </Pressable>
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
  value,
  onPress,
}: {
  theme: Theme;
  icon: string;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
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
      <Iconify icon={icon} size={18} color={theme.colors.textMuted} />
      <Text
        maxFontSizeMultiplier={1.3}
        style={[theme.typography.body, { color: theme.colors.text, marginLeft: theme.spacing.md, flex: 1 }]}
      >
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        style={[theme.typography.caption, { color: theme.colors.textMuted, marginRight: theme.spacing.xs }]}
      >
        {value}
      </Text>
      <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
