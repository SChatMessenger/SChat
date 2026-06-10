import { useEffect } from 'react';
import { AppState, TurboModuleRegistry, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import { IdentityScreen } from './screens/Auth';
import { AppNavigator } from './navigation';
import { setUnauthorizedHandler } from './services/api/client';
import {
  useAppStore,
  useBootStore,
  useChatStore,
  useContactsStore,
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
  const inboxId = useIdentityStore((s) => s.inboxId);
  const hydrateFromStorage = useIdentityStore((s) => s.hydrateFromStorage);
  const chatsHydrated = useChatStore((s) => s.hydrated);
  const hydrateChats = useChatStore((s) => s.hydrateChats);
  const profileHydrated = useAppStore((s) => s.hydrated);
  const hydrateProfile = useAppStore((s) => s.hydrateProfile);

  useEffect(() => {
    void hydrateFromStorage();
    void hydrateProfile();
  }, [hydrateFromStorage, hydrateProfile]);

  // Load (and reload on account switch) the signed-in account's own chat slot.
  // Keying on inboxId means signing in as a different number swaps chats instead
  // of leaking the previous account's conversations.
  useEffect(() => {
    // After chats load, purge expired disappearing chats with non-verified contacts.
    void hydrateChats().then(() => useChatStore.getState().sweepEphemeral());
    // Refresh the contact↔account map in the background (no permission prompt) so
    // an incoming message from someone already in our contacts reveals their saved
    // name + number, while a stranger stays number-less (Telegram-style privacy).
    if (inboxId) void useContactsStore.getState().syncContacts({ passive: true, force: true });
  }, [hydrateChats, inboxId]);

  // Once settings have hydrated, expire stale disappearing chats (cold start).
  useEffect(() => {
    if (profileHydrated) useChatStore.getState().sweepEphemeral();
  }, [profileHydrated]);

  // Session-expired handling: a 401 on any authenticated request signs out and
  // returns to the auth screen (identity keys are kept, so re-login reuses them).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!useIdentityStore.getState().token) return;
      useIdentityStore.getState().sessionExpired();
      useBootStore.getState().reset();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        // Foregrounding: pull any messages that arrived while away, right now —
        // don't wait for the next poll tick. Also expire stale disappearing chats.
        void useChatStore.getState().fetchInbox();
        useChatStore.getState().sweepEphemeral();
      } else {
        // Leaving the foreground: flush RAM-only chat state to the cloud now so
        // nothing is lost when the app is closed (no local cache).
        useChatStore.getState().flushChatState();
      }
    });
    return () => sub.remove();
  }, []);

  // Real-time delivery: a long-poll loop held open by the server and woken the
  // instant a message lands (MTProto-style, no WebSocket). Runs app-wide so
  // delivery works on any screen; idles until signed in.
  useEffect(() => {
    useChatStore.getState().startInboxStream();
    return () => useChatStore.getState().stopInboxStream();
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
