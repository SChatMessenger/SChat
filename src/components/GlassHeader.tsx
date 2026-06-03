import { StyleSheet, View } from 'react-native';
import { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';

// A glass ScreenHeader laid out as an absolute overlay so the screen's content
// scrolls behind it (frosted). `onHeightChange` reports the measured height so
// the consumer can pad its scroll content by that much.
export function GlassHeader({
  onHeightChange,
  ...props
}: ScreenHeaderProps & { onHeightChange?: (height: number) => void }) {
  return (
    <View
      style={styles.overlay}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      <ScreenHeader glass {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
});
