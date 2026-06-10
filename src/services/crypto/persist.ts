// Local passcode hashing for the optional two-step lock.
//
// TODO: this must become Argon2id (high-cost) via the Rust FFI (SudoProto §22 —
// passKey = Argon2id(passcode, salt, …)). This placeholder is a NON-cryptographic
// synchronous digest, sufficient only to let the UI flow build/run. Do NOT ship.
export function passcodeHash(userId: string, pin: string): string {
  const input = `${userId}:${pin}`;
  // FNV-1a 32-bit — deterministic, NOT secure. Replace with FFI Argon2id.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
