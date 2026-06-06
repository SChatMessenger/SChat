// SudoProto 3.0 — owner-encrypted chat state (§0.1.4).
//
// The whole chat store — conversations, message history, AND Double-Ratchet
// state — is serialized and encrypted on-device under a key derived from the
// long-term identity, then stored server-side as opaque ciphertext (the cloud
// system of record, so chats aren't local-only). The relay can't read it; only
// this device's identity can. Distinct key info from the profile blob.
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
import type { SerializedChats } from './persist';
import type { IdentitySecretBundle } from './keys';

const STATE_INFO = utf8Encode('schat/v3 chat-state-key');
const ZERO_SALT = new Uint8Array(64);
const EMPTY_AD = new Uint8Array(0);

function stateKey(identity: IdentitySecretBundle): Uint8Array {
  return hkdfDerive(identity.x25519.sec, ZERO_SALT, STATE_INFO, 32);
}

export function encryptChatState(
  identity: IdentitySecretBundle,
  chats: SerializedChats,
): Uint8Array {
  const key = stateKey(identity);
  const nonce = randomBytes(AEAD_NONCE_BYTES);
  const ct = aeadSeal(key, nonce, EMPTY_AD, utf8Encode(JSON.stringify(chats)));
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce, 0);
  out.set(ct, nonce.length);
  return out;
}

export function decryptChatState(
  identity: IdentitySecretBundle,
  blob: Uint8Array,
): SerializedChats | null {
  if (blob.length < AEAD_NONCE_BYTES + AEAD_TAG_BYTES) return null;
  const key = stateKey(identity);
  const nonce = blob.subarray(0, AEAD_NONCE_BYTES);
  const ct = blob.subarray(AEAD_NONCE_BYTES);
  const pt = aeadOpen(key, nonce, EMPTY_AD, ct);
  if (!pt) return null;
  try {
    return JSON.parse(utf8Decode(pt)) as SerializedChats;
  } catch {
    return null;
  }
}
