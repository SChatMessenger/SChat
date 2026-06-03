import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIdentityStore } from '../../store';
import { useTheme, type Theme } from '../../theme';

const ERROR_RED = '#ef4444';

export function ProfileSetupScreen() {
  const theme = useTheme();
  const username = useIdentityStore((s) => s.username);
  const firstName = useIdentityStore((s) => s.firstName);
  const lastName = useIdentityStore((s) => s.lastName);
  const pending = useIdentityStore((s) => s.pending);
  const error = useIdentityStore((s) => s.error);
  const setUsername = useIdentityStore((s) => s.setUsername);
  const setFirstName = useIdentityStore((s) => s.setFirstName);
  const setLastName = useIdentityStore((s) => s.setLastName);
  const submitProfile = useIdentityStore((s) => s.submitProfile);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { padding: theme.spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>
          Set up your profile
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          This is how friends will find and recognize you.
        </Text>

        <Field
          theme={theme}
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Ada"
          autoFocus
          editable={!pending}
          invalid={!!error && !firstName.trim()}
        />
        <Field
          theme={theme}
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Lovelace"
          editable={!pending}
        />
        <Field
          theme={theme}
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="ada_l"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pending}
          prefix="@"
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
          onPress={submitProfile}
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
            Continue
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  theme,
  label,
  prefix,
  invalid,
  ...input
}: {
  theme: Theme;
  label: string;
  prefix?: string;
  invalid?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <Text
        style={[
          theme.typography.caption,
          { color: theme.colors.textMuted, marginBottom: theme.spacing.xs },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          {
            borderColor: invalid ? ERROR_RED : theme.colors.border,
            borderRadius: theme.radii.md,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
      >
        {prefix ? (
          <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          placeholderTextColor={theme.colors.textMuted}
          style={[
            theme.typography.body,
            {
              flex: 1,
              color: theme.colors.text,
              paddingVertical: theme.spacing.sm,
            },
          ]}
          {...input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});
