import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PinBoxes } from '../../components/PinBoxes';
import { useIdentityStore } from '../../store';
import { useTheme } from '../../theme';

const ERROR_RED = '#ef4444';

export function PasscodeScreen() {
  const theme = useTheme();
  const passcode = useIdentityStore((s) => s.passcode);
  const pending = useIdentityStore((s) => s.pending);
  const error = useIdentityStore((s) => s.error);
  const setPasscode = useIdentityStore((s) => s.setPasscode);
  const submitPasscode = useIdentityStore((s) => s.submitPasscode);
  const startPasscodeReset = useIdentityStore((s) => s.startPasscodeReset);
  const goBack = useIdentityStore((s) => s.goBack);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.container, { padding: theme.spacing.lg }]}>
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>
          Enter your passcode
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          Welcome back. Enter your two-step passcode to finish signing in.
        </Text>

        <PinBoxes
          value={passcode}
          onChangeText={setPasscode}
          autoFocus
          editable={!pending}
          error={!!error}
          onSubmit={submitPasscode}
          style={{ marginTop: theme.spacing.lg }}
        />

        {error ? (
          <Text
            style={[
              theme.typography.caption,
              { color: ERROR_RED, marginTop: theme.spacing.sm },
            ]}
          >
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={submitPasscode}
          disabled={pending}
          style={({ pressed }) => [
            {
              marginTop: theme.spacing.lg,
              alignItems: 'center',
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.primary,
              opacity: pending || pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[theme.typography.body, { color: theme.colors.onPrimary }]}>
            {pending ? 'Checking…' : 'Unlock'}
          </Text>
        </Pressable>

        <Pressable
          onPress={startPasscodeReset}
          disabled={pending}
          style={({ pressed }) => [
            {
              marginTop: theme.spacing.md,
              alignItems: 'center',
              paddingVertical: theme.spacing.sm,
              opacity: pending ? 0.5 : pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[theme.typography.caption, { color: theme.colors.primary }]}>
            Forgot passcode?
          </Text>
        </Pressable>

        <Pressable
          onPress={goBack}
          disabled={pending}
          style={({ pressed }) => [
            {
              marginTop: theme.spacing.xs,
              alignItems: 'center',
              paddingVertical: theme.spacing.sm,
              opacity: pending ? 0.5 : pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            Change number
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center' },
});
