import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Intercepts the Android hardware back button (works in both 3-button and
 * gesture navigation modes — Android maps the back-gesture to the same
 * hardwareBackPress event). No-op on iOS.
 *
 * Return `true` from the handler to indicate the back was handled (default
 * behavior of this hook). Return `false` to let the system pop normally.
 */
export function useHardwareBack(handler: () => boolean) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [handler]);
}
