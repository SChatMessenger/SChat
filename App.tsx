import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IdentityScreen } from './app/boot';
import { MainShell } from './app/shell';
import {
  useBootStore,
  useChatStore,
  useIdentityStore,
  type BootPhase,
} from './src/stores';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const phase = useBootStore((s) => s.phase);
  const idHydrated = useIdentityStore((s) => s.hydrated);
  const hydrateFromStorage = useIdentityStore((s) => s.hydrateFromStorage);
  const chatsHydrated = useChatStore((s) => s.hydrated);
  const hydrateChats = useChatStore((s) => s.hydrateChats);

  useEffect(() => {
    void hydrateFromStorage();
    void hydrateChats();
  }, [hydrateFromStorage, hydrateChats]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void useIdentityStore.getState().refillOpksIfLow();
      }
    });
    return () => sub.remove();
  }, []);

  if (!idHydrated || !chatsHydrated) return null;
  return renderPhase(phase);
}

function renderPhase(phase: BootPhase) {
  switch (phase) {
    case 'identity':
      return <IdentityScreen />;
    case 'ready':
      return <MainShell />;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
