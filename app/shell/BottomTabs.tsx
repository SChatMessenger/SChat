import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Iconify } from 'react-native-iconify';
import { useTabsStore, type TabKey } from '../../src/stores';
import { useTheme } from '../../src/theme';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'chats', label: 'Chats' },
  { key: 'status', label: 'Status' },
  { key: 'communities', label: 'Communities' },
  { key: 'profile', label: 'Profile' },
];

const ICON_SIZE = 22;

function TabIcon({ tabKey, color }: { tabKey: TabKey; color: string }) {
  switch (tabKey) {
    case 'chats':
      return <Iconify icon="lucide:message-circle" size={ICON_SIZE} color={color} />;
    case 'status':
      return <Iconify icon="lucide:lightbulb" size={ICON_SIZE} color={color} />;
    case 'communities':
      return <Iconify icon="lucide:users" size={ICON_SIZE} color={color} />;
    case 'profile':
      return <Iconify icon="lucide:user" size={ICON_SIZE} color={color} />;
  }
}

export function BottomTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const activeTab = useTabsStore((s) => s.activeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: theme.spacing.xs,
          paddingBottom: insets.bottom + theme.spacing.xs,
          paddingHorizontal: theme.spacing.xs,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        const iconColor = active ? theme.colors.primary : theme.colors.textMuted;
        const labelColor = active ? theme.colors.text : theme.colors.textMuted;
        return (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.item,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <TabIcon tabKey={tab.key} color={iconColor} />
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: labelColor, fontWeight: active ? '600' : '400' },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: { fontSize: 11, letterSpacing: 0.3, marginTop: 2 },
});
