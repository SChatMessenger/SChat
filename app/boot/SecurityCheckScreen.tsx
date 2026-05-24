import { useBootAutoAdvance, useBootStore } from '../../src/stores';
import { BootPhaseShell } from './BootPhaseShell';

export function SecurityCheckScreen() {
  useBootAutoAdvance(700);
  const error = useBootStore((s) => s.error);
  const retry = useBootStore((s) => s.retry);
  return (
    <BootPhaseShell
      title="Security Check"
      subtitle="Verifying device integrity…"
      error={error}
      onRetry={retry}
    />
  );
}
