import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../theme';

export function CommunitiesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
        }}
      >
        <Text style={[theme.typography.heading, { color: theme.colors.text }]}>Communities</Text>
        <View
          style={[
            styles.accent,
            { backgroundColor: theme.colors.primary, marginTop: theme.spacing.sm },
          ]}
        />
      </View>
      <View style={styles.empty}>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
          No communities yet.
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.xs },
          ]}
        >
          groups + channels under one roof
        </Text>
      </View>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  accent: { width: 28, height: 3, borderRadius: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
