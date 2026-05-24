import { useBootAutoAdvance, useBootStore } from '../../src/stores';
import { BootPhaseShell } from './BootPhaseShell';

export function NetworkScreen() {
  useBootAutoAdvance(800);
  const error = useBootStore((s) => s.error);
  const retry = useBootStore((s) => s.retry);
  return (
    <BootPhaseShell
      title="Network"
      subtitle="Connecting to the network…"
      error={error}
      onRetry={retry}
    />
  );
}
