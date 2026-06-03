import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore, useIdentityStore } from '../../store';
import { useTheme } from '../../theme';

export function WelcomeScreen() {
  const theme = useTheme();
  const firstName = useAppStore((s) => s.firstName);
  const displayName = useAppStore((s) => s.displayName);
  const finishWelcome = useIdentityStore((s) => s.finishWelcome);

  const name = (firstName || displayName).trim();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, padding: theme.spacing.lg },
      ]}
    >
      <Text style={[theme.typography.title, { color: theme.colors.text, fontSize: 32 }]}>
        {name ? `Welcome, ${name}` : 'Welcome to SChat'}
      </Text>
      <Text
        style={[
          theme.typography.body,
          {
            color: theme.colors.textMuted,
            marginTop: theme.spacing.md,
            textAlign: 'center',
          },
        ]}
      >
        Your chats are end-to-end encrypted. Let's get started.
      </Text>

      <Pressable
        onPress={finishWelcome}
        style={({ pressed }) => [
          {
            marginTop: theme.spacing.xl,
            alignSelf: 'stretch',
            alignItems: 'center',
            paddingVertical: theme.spacing.md,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text style={[theme.typography.body, { color: theme.colors.onPrimary }]}>
          Get started
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
