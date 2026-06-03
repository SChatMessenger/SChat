import { Pressable, Switch, Text, View } from 'react-native';
import { Iconify } from 'react-native-iconify';
import { useTheme } from '../theme';

const DANGER = '#ff453a';

export type SettingsRowProps = {
  icon?: string;
  iconColor?: string;
  label: string;
  labelColor?: string;
  /** Secondary line under the label. */
  subtitle?: string;
  /** Trailing muted value text (e.g. "10 MB"). */
  value?: string;
  /** Show a trailing chevron (implies a navigable row). */
  chevron?: boolean;
  /** Trailing switch. Takes precedence over value/chevron/right. */
  toggle?: { value: boolean; onValueChange: (v: boolean) => void };
  /** Custom trailing node. */
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Indent under a group header. */
  indent?: boolean;
  /** Tighter row + smaller icon/label, for dense lists. */
  compact?: boolean;
  /** Red label/icon for destructive actions. */
  danger?: boolean;
};

// One row primitive covering toggles, navigation/value rows, and plain labels.
export function SettingsRow({
  icon,
  iconColor,
  label,
  labelColor,
  subtitle,
  value,
  chevron,
  toggle,
  right,
  onPress,
  disabled,
  indent,
  compact,
  danger,
}: SettingsRowProps) {
  const theme = useTheme();
  const iconSize = compact ? 16 : 18;
  const color = danger ? DANGER : labelColor ?? theme.colors.text;
  const labelStyle = compact
    ? { fontSize: 14, lineHeight: 18 }
    : {};

  const inner = (pressed: boolean) => (
    <>
      {icon ? <Iconify icon={icon} size={iconSize} color={danger ? DANGER : iconColor ?? theme.colors.textMuted} /> : null}
      <View style={{ flex: 1, marginLeft: icon ? (compact ? theme.spacing.sm : theme.spacing.md) : 0 }}>
        <Text maxFontSizeMultiplier={1.3} style={[theme.typography.body, { color }, labelStyle]}>
          {label}
        </Text>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={1.3}
            style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: compact ? 1 : 2 }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onValueChange}
          disabled={disabled}
          // The native switch is ~31px tall; in compact rows that makes a toggle
          // row sit taller than a value/nav row. Scale it down and pull its
          // layout footprint in with a negative margin so the heights match.
          style={compact ? { transform: [{ scale: 0.8 }], marginVertical: -6 } : undefined}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        />
      ) : (
        <>
          {right}
          {value ? (
            <Text maxFontSizeMultiplier={1.3} style={[theme.typography.caption, { color: theme.colors.textMuted, marginRight: chevron ? 4 : 0 }]}>
              {value}
            </Text>
          ) : null}
          {chevron ? <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} /> : null}
        </>
      )}
    </>
  );

  const base = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.md,
    paddingLeft: indent ? theme.spacing.xl : theme.spacing.md,
    paddingVertical: compact ? 2 : theme.spacing.sm,
    opacity: disabled && !toggle ? 0.4 : 1,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}` : label}
        style={({ pressed }) => [base, { backgroundColor: pressed ? theme.colors.background : 'transparent' }]}
      >
        {({ pressed }) => inner(pressed)}
      </Pressable>
    );
  }
  return <View style={[base, { opacity: disabled ? 0.4 : 1 }]}>{inner(false)}</View>;
}
