import {
  ED25519_SIG_BYTES,
  X25519_KEY_BYTES,
  ed25519Sign,
  x25519KeyGen,
} from './primitives';
import type { IdentitySecretBundle, OpkSecret } from './session';

export const OPK_INITIAL_COUNT = 50;
export const OPK_REFILL_THRESHOLD = 10;
export const OPK_REFILL_BATCH = 40;
const OPK_ENTRY_BYTES = 4 + X25519_KEY_BYTES + ED25519_SIG_BYTES;

export type OpkEntry = {
  id: number;
  pub: Uint8Array;
  sig: Uint8Array;
};

export function mintOpks(
  identity: IdentitySecretBundle,
  count: number,
): OpkEntry[] {
  const entries: OpkEntry[] = [];
  for (let i = 0; i < count; i++) {
    const id = identity.nextOpkId;
    identity.nextOpkId += 1;
    const kp = x25519KeyGen();
    const sig = ed25519Sign(identity.ed25519.sec, kp.pub);
    identity.opkPool.set(id, { pub: kp.pub, sec: kp.sec, sig });
    entries.push({ id, pub: kp.pub, sig });
  }
  return entries;
}

export function consumeOpkSecret(
  identity: IdentitySecretBundle,
  prekeyId: number,
): OpkSecret | null {
  const slot = identity.opkPool.get(prekeyId);
  if (!slot) return null;
  identity.opkPool.delete(prekeyId);
  return slot;
}

export function serializeOpkUpload(entries: OpkEntry[]): Uint8Array {
  const out = new Uint8Array(2 + entries.length * OPK_ENTRY_BYTES);
  out[0] = entries.length & 0xff;
  out[1] = (entries.length >>> 8) & 0xff;
  let off = 2;
  for (const e of entries) {
    out[off] = e.id & 0xff;
    out[off + 1] = (e.id >>> 8) & 0xff;
    out[off + 2] = (e.id >>> 16) & 0xff;
    out[off + 3] = (e.id >>> 24) & 0xff;
    off += 4;
    out.set(e.pub, off);
    off += X25519_KEY_BYTES;
    out.set(e.sig, off);
    off += ED25519_SIG_BYTES;
  }
  return out;
}
