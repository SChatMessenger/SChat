import { useBootAutoAdvance, useBootStore } from '../../src/stores';
import { BootPhaseShell } from './BootPhaseShell';

export function SplashScreen() {
  useBootAutoAdvance(600);
  const error = useBootStore((s) => s.error);
  const retry = useBootStore((s) => s.retry);
  return <BootPhaseShell title="SChat" subtitle="Starting up…" error={error} onRetry={retry} />;
}
