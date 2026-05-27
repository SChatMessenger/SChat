import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIdentityStore } from '../../store';
import { useTheme, type Theme } from '../../theme';
import { COUNTRIES, countryByDial, type Country } from '../../utils/countries';

const ERROR_RED = '#ef4444';

export function PhoneEntryScreen() {
  const theme = useTheme();
  const phone = useIdentityStore((s) => s.phone);
  const dialCode = useIdentityStore((s) => s.dialCode);
  const pending = useIdentityStore((s) => s.pending);
  const error = useIdentityStore((s) => s.error);
  const setPhone = useIdentityStore((s) => s.setPhone);
  const setDialCode = useIdentityStore((s) => s.setDialCode);
  const sendCode = useIdentityStore((s) => s.sendCode);

  const [pickerOpen, setPickerOpen] = useState(false);
  const country = countryByDial(dialCode);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.container, { padding: theme.spacing.lg }]}>
        <Text style={[theme.typography.title, { color: theme.colors.text }]}>
          Sign in or sign up
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          Enter your phone number. We'll send a 6-digit code by SMS.
        </Text>

        <View style={[styles.row, { marginTop: theme.spacing.lg }]}>
          <Pressable
            onPress={() => setPickerOpen(true)}
            disabled={pending}
            style={({ pressed }) => [
              styles.dialChip,
              {
                borderColor: error ? ERROR_RED : theme.colors.border,
                backgroundColor: pressed ? theme.colors.surface : 'transparent',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.md,
              },
            ]}
          >
            <Text style={styles.flag}>{country.flag}</Text>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.text, marginLeft: 6, fontWeight: '600' },
              ]}
            >
              {country.dial}
            </Text>
            <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>▾</Text>
          </Pressable>

          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="98765 43210"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            autoFocus
            editable={!pending}
            style={[
              theme.typography.body,
              {
                flex: 1,
                marginLeft: theme.spacing.sm,
                color: theme.colors.text,
                borderColor: error ? ERROR_RED : theme.colors.border,
                borderWidth: 1,
                borderRadius: theme.radii.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
              },
            ]}
          />
        </View>

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

      <CountryPicker
        visible={pickerOpen}
        theme={theme}
        selected={country}
        onClose={() => setPickerOpen(false)}
        onSelect={(c) => {
          setDialCode(c.dial);
          setPickerOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function CountryPicker({
  visible,
  theme,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  theme: Theme;
  selected: Country;
  onClose: () => void;
  onSelect: (c: Country) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[pickerStyles.card, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[theme.typography.title, { color: theme.colors.text }]}>Country</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              theme.typography.body,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: theme.radii.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                marginTop: theme.spacing.md,
              },
            ]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            style={{ marginTop: theme.spacing.sm, maxHeight: 360 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={({ pressed }) => [
                  pickerStyles.row,
                  {
                    backgroundColor: pressed ? theme.colors.background : 'transparent',
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                  },
                ]}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text
                  numberOfLines={1}
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text, flex: 1, marginLeft: theme.spacing.md },
                  ]}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    theme.typography.body,
                    {
                      color:
                        item.code === selected.code
                          ? theme.colors.primary
                          : theme.colors.textMuted,
                      fontWeight: item.code === selected.code ? '700' : '400',
                    },
                  ]}
                >
                  {item.dial}
                </Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  dialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  flag: { fontSize: 18 },
  chevron: { marginLeft: 4, fontSize: 14 },
});

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { padding: 20, borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 8 },
});
