import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Iconify } from 'react-native-iconify';
import { useTheme } from '../theme';
import { BottomSheet } from './BottomSheet';

export type OptionItem<K extends string = string> = {
  key: K;
  label: string;
  icon?: string;
  blurb?: string;
};

type Props<K extends string> = {
  visible: boolean;
  title: string;
  options: OptionItem<K>[];
  value: K | null;
  onChange: (key: K) => void;
  onDismiss: () => void;
  footer?: { icon: string; label: string; onPress: () => void };
};

// Single-select list presented in a BottomSheet.
export function OptionSheet<K extends string>({
  visible,
  title,
  options,
  value,
  onChange,
  onDismiss,
  footer,
}: Props<K>) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title={title} scrollable>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.row,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: 14,
                backgroundColor: pressed ? theme.colors.surface : 'transparent',
              },
            ]}
          >
            {opt.icon ? (
              <Iconify icon={opt.icon} size={18} color={active ? theme.colors.primary : theme.colors.textMuted} />
            ) : null}
            <View style={{ flex: 1, marginLeft: opt.icon ? theme.spacing.md : 0 }}>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[theme.typography.body, { color: theme.colors.text, fontWeight: active ? '700' : '500' }]}
              >
                {opt.label}
              </Text>
              {opt.blurb ? (
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}
                >
                  {opt.blurb}
                </Text>
              ) : null}
            </View>
            {active ? <Iconify icon="lucide:circle-check" size={18} color={theme.colors.primary} /> : null}
          </Pressable>
        );
      })}
      {footer ? (
        <>
          <View
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: theme.colors.border,
              marginVertical: theme.spacing.sm,
              marginHorizontal: theme.spacing.lg,
            }}
          />
          <Pressable
            onPress={footer.onPress}
            style={({ pressed }) => [
              styles.row,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: 14,
                backgroundColor: pressed ? theme.colors.surface : 'transparent',
              },
            ]}
          >
            <Iconify icon={footer.icon} size={18} color={theme.colors.primary} />
            <Text
              maxFontSizeMultiplier={1.3}
              style={[theme.typography.body, { color: theme.colors.primary, marginLeft: theme.spacing.md, flex: 1, fontWeight: '600' }]}
            >
              {footer.label}
            </Text>
            <Iconify icon="lucide:chevron-right" size={14} color={theme.colors.textMuted} />
          </Pressable>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
