import { useBootAutoAdvance, useBootStore } from '../../src/stores';
import { BootPhaseShell } from './BootPhaseShell';

export function KeyUnlockScreen() {
  useBootAutoAdvance(700);
  const error = useBootStore((s) => s.error);
  const retry = useBootStore((s) => s.retry);
  return (
    <BootPhaseShell
      title="Key Unlock"
      subtitle="Unlocking your keys…"
      error={error}
      onRetry={retry}
    />
  );
}
