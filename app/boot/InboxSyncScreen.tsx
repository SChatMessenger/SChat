import { useBootAutoAdvance, useBootStore } from '../../src/stores';
import { BootPhaseShell } from './BootPhaseShell';

export function InboxSyncScreen() {
  useBootAutoAdvance(1000);
  const error = useBootStore((s) => s.error);
  const retry = useBootStore((s) => s.retry);
  return (
    <BootPhaseShell
      title="Inbox Sync"
      subtitle="Syncing your inbox…"
      error={error}
      onRetry={retry}
    />
  );
}
