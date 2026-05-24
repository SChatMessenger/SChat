import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../src/theme';

type Props = {
  title: string;
  subtitle?: string;
  error?: string | null;
  onRetry?: () => void;
};

export function BootPhaseShell({ title, subtitle, error, onRetry }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, padding: theme.spacing.lg },
      ]}
    >
      <Text style={[theme.typography.title, { color: theme.colors.text }]}>{title}</Text>
      {subtitle && !error ? (
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
      {!error ? (
        <ActivityIndicator
          color={theme.colors.primary}
          style={{ marginTop: theme.spacing.lg }}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: theme.spacing.lg }}>
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.text, textAlign: 'center' },
            ]}
          >
            {error}
          </Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [
                {
                  marginTop: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.lg,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={[theme.typography.body, { color: theme.colors.onPrimary }]}>
                Retry
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
