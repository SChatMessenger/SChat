import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme';

export type ScreenHeaderProps = {
  title: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  hideAccent?: boolean;
  /** Frosted translucent header that content scrolls behind (glassmorphism). */
  glass?: boolean;
  style?: ViewStyle;
};

export function ScreenHeader({ title, leftSlot, rightSlot, hideAccent, glass, style }: ScreenHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          // Header background extends up behind the transparent status bar so
          // the bar + action bar read as one (Telegram-style).
          backgroundColor: glass ? 'transparent' : theme.colors.background,
          // insets.top keeps the title below the status-bar clock/battery.
          paddingTop: insets.top + (leftSlot ? theme.spacing.sm : theme.spacing.md),
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
        },
        glass ? { borderBottomColor: theme.colors.glassEdge, borderBottomWidth: StyleSheet.hairlineWidth } : null,
        style,
      ]}
    >
      {glass ? (
        <>
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
        </>
      ) : null}
      <View style={styles.row}>
        {leftSlot ? <View style={{ marginRight: theme.spacing.sm }}>{leftSlot}</View> : null}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={[theme.typography.heading, { color: theme.colors.text }]}
          >
            {title}
          </Text>
          {hideAccent ? null : (
            <View
              style={[
                styles.accent,
                { backgroundColor: theme.colors.primary, marginTop: theme.spacing.sm },
              ]}
            />
          )}
        </View>
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rightSlot: { flexDirection: 'row', alignItems: 'center' },
  accent: { width: 28, height: 3, borderRadius: 2 },
});
