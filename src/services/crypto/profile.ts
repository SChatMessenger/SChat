// SudoProto 3.0 — owner-encrypted profile blob (§0.1.4).
//
// {username, name, bio, …} is encrypted on-device under a key derived from the
// long-term identity, then stored server-side as opaque ciphertext. The relay
// (and a DB dump) sees nothing readable; only this device's identity can decrypt
// it. Forward-compatible with the Part C vault: restore the identity → restore
// the profile.
import {
  AEAD_NONCE_BYTES,
  AEAD_TAG_BYTES,
  aeadOpen,
  aeadSeal,
  hkdfDerive,
  randomBytes,
  utf8Decode,
  utf8Encode,
} from './primitives';
import type { IdentitySecretBundle } from './keys';

const PROFILE_INFO = utf8Encode('schat/v3 profile-key');
const ZERO_SALT = new Uint8Array(64);
const EMPTY_AD = new Uint8Array(0);

export type ProfilePayload = {
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string;
};

function profileKey(identity: IdentitySecretBundle): Uint8Array {
  return hkdfDerive(identity.x25519.sec, ZERO_SALT, PROFILE_INFO, 32);
}

export function encryptProfile(identity: IdentitySecretBundle, p: ProfilePayload): Uint8Array {
  const key = profileKey(identity);
  const nonce = randomBytes(AEAD_NONCE_BYTES);
  const ct = aeadSeal(key, nonce, EMPTY_AD, utf8Encode(JSON.stringify(p)));
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce, 0);
  out.set(ct, nonce.length);
  return out;
}

export function decryptProfile(
  identity: IdentitySecretBundle,
  blob: Uint8Array,
): ProfilePayload | null {
  if (blob.length < AEAD_NONCE_BYTES + AEAD_TAG_BYTES) return null;
  const key = profileKey(identity);
  const nonce = blob.subarray(0, AEAD_NONCE_BYTES);
  const ct = blob.subarray(AEAD_NONCE_BYTES);
  const pt = aeadOpen(key, nonce, EMPTY_AD, ct);
  if (!pt) return null;
  try {
    return JSON.parse(utf8Decode(pt)) as ProfilePayload;
  } catch {
    return null;
  }
}
