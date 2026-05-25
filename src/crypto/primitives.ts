import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { sha3_256, sha3_512 } from '@noble/hashes/sha3.js';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';

nacl.setPRNG((x, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

const g = globalThis as unknown as { crypto?: { getRandomValues?: <T extends ArrayBufferView>(a: T) => T } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = <T extends ArrayBufferView>(arr: T): T => {
    const out = Crypto.getRandomBytes(arr.byteLength);
    new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).set(out);
    return arr;
  };
}

export const X25519_KEY_BYTES = 32;
export const KYBER_PUB_BYTES = ml_kem1024.lengths.publicKey ?? 1568;
export const KYBER_SEC_BYTES = ml_kem1024.lengths.secretKey ?? 3168;
export const KYBER_CT_BYTES = ml_kem1024.lengths.cipherText ?? 1568;
export const ED25519_PUB_BYTES = 32;
export const ED25519_SEC_BYTES = 32;
export const ED25519_SIG_BYTES = 64;
export const AEAD_KEY_BYTES = 32;
export const AEAD_NONCE_BYTES = 12;
export const AEAD_TAG_BYTES = 16;
export const SHARED_SECRET_BYTES = 32;

export function randomBytes(n: number): Uint8Array {
  return Crypto.getRandomBytes(n);
}

export type X25519Keypair = { pub: Uint8Array; sec: Uint8Array };
export type KyberKeypair = { pub: Uint8Array; sec: Uint8Array };

export function x25519KeyGen(): X25519Keypair {
  const sec = randomBytes(X25519_KEY_BYTES);
  const kp = nacl.box.keyPair.fromSecretKey(sec);
  return { pub: kp.publicKey, sec: kp.secretKey };
}

export function x25519Dh(mySec: Uint8Array, theirPub: Uint8Array): Uint8Array {
  return nacl.scalarMult(mySec, theirPub);
}

export function kyberKeyGen(): KyberKeypair {
  const kp = ml_kem1024.keygen();
  return { pub: kp.publicKey, sec: kp.secretKey };
}

export function kyberEncap(theirPub: Uint8Array): {
  ct: Uint8Array;
  ss: Uint8Array;
} {
  const r = ml_kem1024.encapsulate(theirPub);
  return { ct: r.cipherText, ss: r.sharedSecret };
}

export function kyberDecap(ct: Uint8Array, mySec: Uint8Array): Uint8Array {
  return ml_kem1024.decapsulate(ct, mySec);
}

export type Ed25519Keypair = { pub: Uint8Array; sec: Uint8Array };

export function ed25519KeyGen(): Ed25519Keypair {
  const kp = ed25519.keygen();
  return { pub: kp.publicKey, sec: kp.secretKey };
}

export function ed25519Sign(sec: Uint8Array, msg: Uint8Array): Uint8Array {
  return ed25519.sign(msg, sec);
}

export function ed25519Verify(
  pub: Uint8Array,
  msg: Uint8Array,
  sig: Uint8Array,
): boolean {
  try {
    return ed25519.verify(sig, msg, pub);
  } catch {
    return false;
  }
}

export function hkdfDerive(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Uint8Array {
  return hkdf(sha512, ikm, salt, info, length);
}

export function hmacSha512(key: Uint8Array, msg: Uint8Array): Uint8Array {
  return hmac(sha512, key, msg);
}

export function aeadSeal(
  key: Uint8Array,
  nonce: Uint8Array,
  ad: Uint8Array,
  pt: Uint8Array,
): Uint8Array {
  return chacha20poly1305(key, nonce, ad).encrypt(pt);
}

export function aeadOpen(
  key: Uint8Array,
  nonce: Uint8Array,
  ad: Uint8Array,
  ct: Uint8Array,
): Uint8Array | null {
  try {
    return chacha20poly1305(key, nonce, ad).decrypt(ct);
  } catch {
    return null;
  }
}

export function fingerprint(bytes: Uint8Array): string {
  const h = sha3_256(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += h[i].toString(16).padStart(2, '0');
  }
  return out.toUpperCase();
}

export function safetyNumber(a: Uint8Array, b: Uint8Array): string {
  const ordered = bytesLessOrEqual(a, b) ? concat(a, b) : concat(b, a);
  const h = sha3_512(ordered);
  let out = '';
  for (let i = 0; i < 12; i++) {
    const off = i * 4;
    const v =
      (h[off] * 0x1000000 +
        h[off + 1] * 0x10000 +
        h[off + 2] * 0x100 +
        h[off + 3]) %
      100000;
    out += String(v).padStart(5, '0');
    if (i < 11) out += ' ';
  }
  return out;
}

function bytesLessOrEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return a.length <= b.length;
}

export function zeroize(...bufs: (Uint8Array | null | undefined)[]): void {
  for (const b of bufs) {
    if (!b) continue;
    for (let i = 0; i < b.length; i++) b[i] = 0;
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export const PAD_BLOCK = 256;

export function padPlaintext(pt: Uint8Array): Uint8Array {
  if (pt.length > 0xffff) throw new Error('plaintext too long');
  const inner = pt.length + 2;
  const padded = Math.ceil(inner / PAD_BLOCK) * PAD_BLOCK;
  const out = new Uint8Array(padded);
  out[0] = pt.length & 0xff;
  out[1] = (pt.length >>> 8) & 0xff;
  out.set(pt, 2);
  return out;
}

export function unpadPlaintext(padded: Uint8Array): Uint8Array | null {
  if (padded.length < 2) return null;
  const len = padded[0] | (padded[1] << 8);
  if (len > padded.length - 2) return null;
  return padded.subarray(2, 2 + len);
}

export function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function utf8Decode(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function hex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export function unhex(s: string): Uint8Array {
  const clean = s.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
