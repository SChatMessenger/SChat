// SudoProto 3.0 — Self-Issued Session Certificates, client side (§0.1.2).
//
// Mirrors backend/src/services/sisc.rs byte-for-byte: ECDSA-P256 over SHA-256 of
// an LE32 length-prefixed canonical message, with domain-separated contexts.
// The relay only verifies these signatures against the account's public key — it
// holds no secret. There is no JWT and no bearer token.
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { concat, utf8Encode } from './primitives';

export const CTX_REGISTER = utf8Encode('schat/v3 register');
export const CTX_SESSION = utf8Encode('schat/v3 sess');
export const CTX_REQUEST = utf8Encode('schat/v3 req');

export type P256Keypair = { pub: Uint8Array; sec: Uint8Array };

export function p256KeyGen(): P256Keypair {
  const kp = p256.keygen();
  return { pub: kp.publicKey, sec: kp.secretKey };
}

/// ECDSA-P256 over SHA-256(msg), returned as a 64-byte compact (r‖s, low-S)
/// signature. `prehash: true` makes noble hash with the curve hash (SHA-256),
/// matching the Rust verifier `VerifyingKey::verify`, which hashes msg the same way.
export function p256Sign(sec: Uint8Array, msg: Uint8Array): Uint8Array {
  return p256.sign(msg, sec, { prehash: true });
}

/// LE32 length-prefixed concatenation. Injective in the field tuple — must stay
/// byte-identical to `services::sisc::canon` on the backend.
export function canon(fields: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const f of fields) {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, f.length, true); // LE32
    parts.push(len, f);
  }
  return concat(...parts);
}

// i64 little-endian, matching Rust `i64::to_le_bytes`.
function le64(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(Math.trunc(n)), true);
  return b;
}

export function signRegistration(
  authSec: Uint8Array,
  authPub: Uint8Array,
  phone: string,
  otp: string,
): Uint8Array {
  return p256Sign(authSec, canon([CTX_REGISTER, utf8Encode(phone), utf8Encode(otp), authPub]));
}

export function signSessionCert(
  authSec: Uint8Array,
  sessionPub: Uint8Array,
  account: string,
  exp: number,
  epoch: number,
): Uint8Array {
  return p256Sign(
    authSec,
    canon([CTX_SESSION, sessionPub, utf8Encode(account), le64(exp), le64(epoch)]),
  );
}

export function signRequest(
  sessionSec: Uint8Array,
  method: string,
  path: string,
  bodyHash: Uint8Array,
  inbox: string,
  ts: number,
  nonce: Uint8Array,
): Uint8Array {
  return p256Sign(
    sessionSec,
    canon([CTX_REQUEST, utf8Encode(method), utf8Encode(path), bodyHash, utf8Encode(inbox), le64(ts), nonce]),
  );
}

export function sha256Bytes(b: Uint8Array): Uint8Array {
  return sha256(b);
}
