import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Iconify } from 'react-native-iconify';
import { useTheme } from '../theme';
import { usePressScale } from '../hooks/usePressScale';

type Props = {
  icon: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

export function IconButton({ icon, onPress, size = 20, color, accessibilityLabel, style }: Props) {
  const theme = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale(0.85);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={theme.touch.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.btn,
            {
              width: theme.touch.min,
              height: theme.touch.min,
              borderRadius: theme.touch.min / 2,
              backgroundColor: pressed ? theme.colors.surface : 'transparent',
              transform: [{ scale }],
            },
            style,
          ]}
        >
          <Iconify icon={icon} size={size} color={color ?? theme.colors.text} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
});
