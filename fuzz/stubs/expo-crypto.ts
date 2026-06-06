// Node stub for `expo-crypto`, used only by the crypto fuzz harness (fuzz/).
// The real module is a React-Native native module that can't load under plain
// Node; the parser engine only ever calls `getRandomBytes`, which we back with
// Node's CSPRNG so the harness can stand up real X25519/Ed25519/ML-KEM keys.
import { randomBytes } from 'node:crypto';

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}

export function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return Promise.resolve(getRandomBytes(byteCount));
}
