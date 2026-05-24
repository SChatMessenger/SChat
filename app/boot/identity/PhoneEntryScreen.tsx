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

export function PhoneEntryScreen() {
  const theme = useTheme();
  const phone = useIdentityStore((s) => s.phone);
  const pending = useIdentityStore((s) => s.pending);
  const error = useIdentityStore((s) => s.error);
  const setPhone = useIdentityStore((s) => s.setPhone);
  const sendCode = useIdentityStore((s) => s.sendCode);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.container, { padding: theme.spacing.lg }]}>
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>
          Enter your number
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          We'll send you a 6-digit code by SMS.
        </Text>

        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+1 555 555 0100"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="phone-pad"
          autoFocus
          editable={!pending}
          style={[
            theme.typography.body,
            {
              color: theme.colors.text,
              marginTop: theme.spacing.lg,
              borderColor: error ? ERROR_RED : theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.radii.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
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
          onPress={sendCode}
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
            {pending ? 'Sending…' : 'Send code'}
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
