import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Native-feeling push transition on mount: a horizontal slide with a cubic
 * ease-out (iOS-like). Deliberately NO opacity fade and NO scale — the app's
 * native window is always white (userInterfaceStyle is "light"; dark theme is
 * RN-only), so a see-through or shrunk screen would flash that white window
 * through its edges. Staying fully opaque and full-size keeps the themed
 * background covering the window at every frame.
 *
 * `close(done)` plays the reverse slide and invokes `done` once it settles, so
 * the parent can unmount after the exit animation instead of snapping away the
 * moment "< back" is tapped.
 */
export function useSlideIn(from = 36) {
  const translateX = useRef(new Animated.Value(from)).current;
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 320,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const close = useCallback(
    (done: () => void) => {
      if (closing.current) return;
      closing.current = true;
      // Decelerating curve so it eases to a stop instead of snapping out.
      Animated.timing(translateX, {
        toValue: from,
        duration: 220,
        easing: Easing.bezier(0.33, 0, 0.2, 1),
        useNativeDriver: true,
      }).start(() => done());
    },
    [translateX, from],
  );

  return {
    style: {
      transform: [{ translateX }],
    },
    close,
  };
}
