import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useChatStore,
  useContactsStore,
  type EnrichedContact,
} from '../../store';
import { useTheme, type Theme } from '../../theme';

const ON_SCHAT_GREEN = '#22c55e';
const ERROR_RED = '#ef4444';

export function NewChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const closeCompose = useChatStore((s) => s.closeCompose);
  const findContact = useChatStore((s) => s.findContact);
  const lookupPending = useChatStore((s) => s.lookupPending);
  const lookupError = useChatStore((s) => s.lookupError);

  const contacts = useContactsStore((s) => s.contacts);
  const loading = useContactsStore((s) => s.loading);
  const error = useContactsStore((s) => s.error);
  const permissionDenied = useContactsStore((s) => s.permissionDenied);
  const loaded = useContactsStore((s) => s.loaded);
  const syncContacts = useContactsStore((s) => s.syncContacts);

  const [query, setQuery] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPhone, setManualPhone] = useState('');

  useEffect(() => {
    void syncContacts();
  }, [syncContacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      return c.phones.some((p) => p.includes(q));
    });
  }, [contacts, query]);

  const registeredCount = contacts.filter((c) => c.status === 'registered').length;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={closeCompose} hitSlop={12} style={styles.backHit}>
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

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or number"
          placeholderTextColor={theme.colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          style={[
            theme.typography.body,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              marginTop: theme.spacing.md,
            },
          ]}
        />

        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
          ]}
        >
          {loading && !loaded
            ? 'Reading contacts…'
            : permissionDenied
              ? 'Contact permission denied — turn it on in Settings to find people you know.'
              : `${registeredCount} on SChat · ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`}
        </Text>

        {error || lookupError ? (
          <Text
            style={[
              theme.typography.caption,
              { color: ERROR_RED, marginTop: theme.spacing.xs },
            ]}
          >
            {error ?? lookupError}
          </Text>
        ) : null}

        <Pressable
          onPress={() => setManualOpen((v) => !v)}
          style={({ pressed }) => [
            styles.manualToggle,
            {
              marginTop: theme.spacing.md,
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surface : 'transparent',
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radii.md,
            },
          ]}
        >
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.text, fontWeight: '600' },
            ]}
          >
            {manualOpen ? 'Hide manual entry' : 'Add by phone number'}
          </Text>
        </Pressable>

        {manualOpen ? (
          <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm }}>
            <TextInput
              value={manualPhone}
              onChangeText={setManualPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              style={[
                theme.typography.body,
                {
                  flex: 1,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: theme.radii.md,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                },
              ]}
            />
            <Pressable
              onPress={() => {
                if (!manualPhone.trim()) return;
                void findContact(manualPhone.trim());
              }}
              disabled={lookupPending || !manualPhone.trim()}
              style={({ pressed }) => [
                styles.findBtn,
                {
                  backgroundColor: theme.colors.primary,
                  marginLeft: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  opacity: pressed || !manualPhone.trim() ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[theme.typography.body, { color: theme.colors.onPrimary }]}>
                {lookupPending ? '…' : 'Find'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => syncContacts({ force: true })} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <ContactRow
            contact={item}
            theme={theme}
            onPress={() => {
              if (item.status === 'registered' && item.matchedPhone) {
                void findContact(item.matchedPhone);
              }
            }}
            onInvite={() => {
              const phone = item.phones[0] ?? '';
              const sms = Platform.select({
                ios: `sms:${phone}&body=`,
                android: `sms:${phone}?body=`,
                default: `sms:${phone}`,
              });
              void Linking.openURL(`${sms}Join me on SChat.`);
            }}
          />
        )}
        ItemSeparatorComponent={() => (
          <View
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: theme.colors.border,
              marginLeft: theme.spacing.lg + 44 + theme.spacing.md,
            }}
          />
        )}
        ListEmptyComponent={
          loaded && !loading ? (
            <Text
              style={[
                theme.typography.caption,
                {
                  color: theme.colors.textMuted,
                  padding: theme.spacing.lg,
                  textAlign: 'center',
                },
              ]}
            >
              {permissionDenied ? 'Grant contact access to find friends.' : 'No contacts match.'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

function ContactRow({
  contact,
  theme,
  onPress,
  onInvite,
}: {
  contact: EnrichedContact;
  theme: Theme;
  onPress: () => void;
  onInvite: () => void;
}) {
  const registered = contact.status === 'registered';
  const initial = (contact.name.trim()[0] ?? '?').toUpperCase();
  const subtitle = registered
    ? `On SChat · ${contact.matchedPhone}`
    : contact.phones[0] ?? '';
  return (
    <Pressable
      onPress={onPress}
      disabled={!registered}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          backgroundColor: pressed && registered ? theme.colors.surface : 'transparent',
        },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: registered ? theme.colors.primary : theme.colors.surface,
            marginRight: theme.spacing.md,
            borderColor: theme.colors.border,
            borderWidth: registered ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <Text
          style={{
            color: registered ? theme.colors.onPrimary : theme.colors.textMuted,
            fontWeight: '600',
          }}
        >
          {initial}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={[
            theme.typography.body,
            { color: theme.colors.text, fontWeight: '600' },
          ]}
        >
          {contact.name}
        </Text>
        <View style={styles.subRow}>
          {registered ? (
            <Text style={[styles.dotCheck, { color: ON_SCHAT_GREEN }]}>✓</Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginLeft: registered ? 4 : 0 },
            ]}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      {!registered ? (
        <Pressable
          onPress={onInvite}
          hitSlop={8}
          style={({ pressed }) => [
            styles.inviteBtn,
            {
              borderColor: theme.colors.border,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: 6,
              borderRadius: theme.radii.md,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[theme.typography.caption, { color: theme.colors.text, fontWeight: '600' }]}>
            Invite
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backHit: { width: 28, alignItems: 'flex-start' },
  chevron: { fontSize: 28, lineHeight: 28, fontWeight: '300' },
  manualToggle: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  findBtn: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dotCheck: { fontSize: 12, fontWeight: '700' },
  inviteBtn: { borderWidth: StyleSheet.hairlineWidth },
});
