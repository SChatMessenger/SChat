import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  IdentityScreen,
  InboxSyncScreen,
  KeyUnlockScreen,
  NetworkScreen,
  SecurityCheckScreen,
  SplashScreen,
} from './app/boot';
import { ChatHomeScreen } from './app/chat';
import { useBootStore, type BootPhase } from './src/stores';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const phase = useBootStore((s) => s.phase);
  return renderPhase(phase);
}

function renderPhase(phase: BootPhase) {
  switch (phase) {
    case 'splash':
      return <SplashScreen />;
    case 'security':
      return <SecurityCheckScreen />;
    case 'identity':
      return <IdentityScreen />;
    case 'keyUnlock':
      return <KeyUnlockScreen />;
    case 'network':
      return <NetworkScreen />;
    case 'inboxSync':
      return <InboxSyncScreen />;
    case 'ready':
      return <ChatHomeScreen />;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
