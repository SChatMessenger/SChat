import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme, type Theme } from '../theme';

// Uppercase muted caption that heads a group of settings. `theme` is accepted
// for compatibility with existing call sites but ignored.
export function SectionLabel({
  label,
  style,
}: {
  theme?: Theme;
  label: string;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      style={[
        theme.typography.caption,
        {
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginTop: theme.spacing.xl,
          marginBottom: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xs,
        },
        style,
      ]}
    >
      {label}
    </Text>
  );
}
