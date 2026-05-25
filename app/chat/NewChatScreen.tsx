import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatStore } from '../../src/stores';
import { useTheme } from '../../src/theme';

const ERROR_RED = '#ef4444';

export function NewChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const pending = useChatStore((s) => s.lookupPending);
  const error = useChatStore((s) => s.lookupError);
  const findContact = useChatStore((s) => s.findContact);
  const closeCompose = useChatStore((s) => s.closeCompose);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          flex: 1,
        }}
      >
        <View style={styles.header}>
          <Pressable onPress={closeCompose} hitSlop={12} style={styles.back}>
            <Text style={[styles.chevron, { color: theme.colors.primary }]}>‹</Text>
          </Pressable>
          <Text
            style={[
              theme.typography.title,
              { color: theme.colors.text, marginLeft: theme.spacing.xs },
            ]}
          >
            New chat
          </Text>
        </View>

        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          Enter a phone number to find a contact.
        </Text>

        <TextInput
          value={phone}
          onChangeText={(t) => setPhone(t)}
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
          onPress={() => findContact(phone)}
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
            {pending ? 'Looking up…' : 'Find'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 32, alignItems: 'flex-start', justifyContent: 'center' },
  chevron: { fontSize: 32, lineHeight: 32, fontWeight: '300' },
});
