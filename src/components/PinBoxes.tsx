import { useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';

const ERROR_RED = '#ef4444';

/**
 * Segmented PIN entry: a row of boxes backed by one hidden TextInput. Digits
 * fill left-to-right and render masked ('•'). Boxes at or past `minLength` draw
 * dashed, signalling they're optional — so a 4–6 digit code reads as
 * ▢▢▢▢⌐⌐ rather than implying all six are required.
 */
export function PinBoxes({
  value,
  onChangeText,
  length = 6,
  minLength = 4,
  autoFocus,
  editable = true,
  error = false,
  onSubmit,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  length?: number;
  minLength?: number;
  autoFocus?: boolean;
  editable?: boolean;
  error?: boolean;
  onSubmit?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const ref = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => ref.current?.focus()} style={[styles.row, style]}>
      {Array.from({ length }).map((_, i) => {
        const filled = i < value.length;
        const isCursor = editable && i === value.length;
        const optional = i >= minLength;
        return (
          <View
            key={i}
            style={[
              styles.box,
              {
                borderColor: error
                  ? ERROR_RED
                  : isCursor
                    ? theme.colors.primary
                    : theme.colors.border,
                borderRadius: theme.radii.md,
                borderStyle: optional && !filled ? 'dashed' : 'solid',
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text style={[styles.dot, { color: theme.colors.text }]}>
              {filled ? '•' : ''}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        editable={editable}
        maxLength={length}
        onSubmitEditing={onSubmit}
        caretHidden
        contextMenuHidden
        selectionColor="transparent"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  box: {
    width: 44,
    height: 52,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { fontSize: 28, lineHeight: 32 },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
  },
});
