import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIdentityStore } from '../../../src/stores';
import { useTheme } from '../../../src/theme';

const ERROR_RED = '#ef4444';

export function OtpCodeScreen() {
  const theme = useTheme();
  const phone = useIdentityStore((s) => s.phone);
  const code = useIdentityStore((s) => s.code);
  const pending = useIdentityStore((s) => s.pending);
  const error = useIdentityStore((s) => s.error);
  const setCode = useIdentityStore((s) => s.setCode);
  const verifyCode = useIdentityStore((s) => s.verifyCode);
  const goBack = useIdentityStore((s) => s.goBack);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.container, { padding: theme.spacing.lg }]}>
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>
          Enter the code
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          Sent to {phone || 'your phone'}.
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
          onPress={verifyCode}
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
            {pending ? 'Verifying…' : 'Verify'}
          </Text>
        </Pressable>

        <Pressable
          onPress={goBack}
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
