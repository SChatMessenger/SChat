import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../theme';
import { GlassHeader } from '../../components';

export function CommunitiesScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
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
      <GlassHeader title="Communities" />
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
