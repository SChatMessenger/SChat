import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIdentityStore } from '../../store';
import { useTheme } from '../../theme';

const ERROR_RED = '#ef4444';

export function ResetPasscodeScreen() {
  const theme = useTheme();
  const phone = useIdentityStore((s) => s.phone);
  const code = useIdentityStore((s) => s.code);
  const pending = useIdentityStore((s) => s.pending);
  const error = useIdentityStore((s) => s.error);
  const setCode = useIdentityStore((s) => s.setCode);
  const submitPasscodeReset = useIdentityStore((s) => s.submitPasscodeReset);
  const cancelPasscodeReset = useIdentityStore((s) => s.cancelPasscodeReset);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.container, { padding: theme.spacing.lg }]}>
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>
          Reset passcode
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          We sent a new code to {phone || 'your phone'}. Enter it to remove your
          passcode — you can set a new one later in Settings.
        </Text>

        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          autoFocus
          editable={!pending}
          maxLength={6}
          style={[
            {
              color: theme.colors.text,
              marginTop: theme.spacing.lg,
              borderColor: error ? ERROR_RED : theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.radii.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              fontSize: 24,
              letterSpacing: 8,
              textAlign: 'center',
            },
          ]}
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
          onPress={submitPasscodeReset}
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
            {pending ? 'Verifying…' : 'Reset passcode'}
          </Text>
        </Pressable>

        <Pressable
          onPress={cancelPasscodeReset}
          disabled={pending}
          style={({ pressed }) => [
            {
              marginTop: theme.spacing.sm,
              alignItems: 'center',
              paddingVertical: theme.spacing.sm,
              opacity: pending ? 0.5 : pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            Cancel
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
