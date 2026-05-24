import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IdentityScreen } from './app/boot';
import { MainShell } from './app/shell';
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
