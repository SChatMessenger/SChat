// Tiny indirection so useAppStore (profile data) can ask useIdentityStore (which
// holds the identity key) to re-upload the owner-encrypted profile to the cloud,
// without the two stores importing each other (which would be a cycle). The
// identity store registers the trigger; the app store calls it after every local
// profile change. SudoProto 3.0 §0.1.4.
let trigger: (() => void) | null = null;

export function setProfileSyncTrigger(fn: (() => void) | null): void {
  trigger = fn;
}

export function triggerProfileSync(): void {
  trigger?.();
}
