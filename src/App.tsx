import { useEffect } from 'react';
import { AppState, TurboModuleRegistry, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import { IdentityScreen } from './screens/Auth';
import { AppNavigator } from './navigation';
import {
  useAppStore,
  useBootStore,
  useChatStore,
  useIdentityStore,
  type BootPhase,
} from './store';
import { useTheme } from './theme';
import { ThemeTransitionProvider } from './theme/ThemeTransition';

// Edge-to-edge system bars live in react-native-edge-to-edge's native module
// (RNEdgeToEdge), which only exists in a dev build — NOT in Expo Go. Probe for
// it with TurboModuleRegistry.get (returns null instead of throwing), and only
// require the library when present so Expo Go falls back gracefully.
const hasEdgeToEdge = TurboModuleRegistry.get('RNEdgeToEdge') != null;
const SystemBars: React.ComponentType<{ style: 'light' | 'dark' }> | null =
  hasEdgeToEdge ? require('react-native-edge-to-edge').SystemBars : null;

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeTransitionProvider>
        <ThemedRoot>
          <AppContent />
        </ThemedRoot>
      </ThemeTransitionProvider>
    </SafeAreaProvider>
  );
}

function ThemedRoot({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  // Window background behind the (transparent) system bars — keeps the bar area
  // matching the theme even before edge-to-edge paints, avoiding any flash.
  // Guarded: the ExpoSystemUI native module isn't present in every runtime, so
  // swallow the "cannot find native module" error instead of crashing.
  useEffect(() => {
    Promise.resolve()
      .then(() => SystemUI.setBackgroundColorAsync(theme.colors.background))
      .catch(() => {});
  }, [theme.colors.background]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Edge-to-edge: transparent status/nav bars with the theme flowing
          behind them. Icon color contrasts the header (light mode -> dark
          icons, dark -> light). Active in the dev build; skipped in Expo Go. */}
      {SystemBars ? (
        <SystemBars style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      ) : null}
      {children}
    </View>
  );
}

function AppContent() {
  const phase = useBootStore((s) => s.phase);
  const idHydrated = useIdentityStore((s) => s.hydrated);
  const hydrateFromStorage = useIdentityStore((s) => s.hydrateFromStorage);
  const chatsHydrated = useChatStore((s) => s.hydrated);
  const hydrateChats = useChatStore((s) => s.hydrateChats);
  const profileHydrated = useAppStore((s) => s.hydrated);
  const hydrateProfile = useAppStore((s) => s.hydrateProfile);

  useEffect(() => {
    void hydrateFromStorage();
    void hydrateChats();
    void hydrateProfile();
  }, [hydrateFromStorage, hydrateChats, hydrateProfile]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void useIdentityStore.getState().refillOpksIfLow();
      }
    });
    return () => sub.remove();
  }, []);

  if (!idHydrated || !chatsHydrated || !profileHydrated) return null;
  return renderPhase(phase);
}

function renderPhase(phase: BootPhase) {
  switch (phase) {
    case 'identity':
      return <IdentityScreen />;
    case 'ready':
      return <AppNavigator />;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
