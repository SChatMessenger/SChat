/**
 * Device keypair generation + base64 codec.
 *
 * TODO: replace this stub with libsodium (tweetnacl) once the dep is added.
 * Math.random is NOT cryptographically secure — these keys are placeholders
 * so the API contract can be exercised end-to-end. Real E2E security
 * requires a CSPRNG (expo-crypto / react-native-get-random-values) and an
 * authenticated KEM such as nacl.box (curve25519+xsalsa20+poly1305).
 */

const KEY_BYTES = 32;

export type Keypair = {
  publicKey: string;
  secretKey: string;
};

export function generateKeypair(): Keypair {
  return {
    publicKey: randomBase64(KEY_BYTES),
    secretKey: randomBase64(KEY_BYTES),
  };
}

export function randomBase64(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytesToBase64(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const CHARS =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      CHARS[(n >> 18) & 63] +
      CHARS[(n >> 12) & 63] +
      CHARS[(n >> 6) & 63] +
      CHARS[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    const n = (bytes[i] << 16) | ((rem === 2 ? bytes[i + 1] : 0) << 8);
    out += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63];
    out += rem === 2 ? CHARS[(n >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

export function utf8ToBytes(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

/**
 * Stub "encrypt": base64s the plaintext as ciphertext, returns dummy nonce
 * and envelope. Pure structural placeholder — produces the shape the backend
 * accepts so the round-trip can be tested. Replace with nacl.box.
 */
export function sealForRecipient(
  plaintext: string,
  _recipientPublicKey: string,
  _senderSecretKey: string,
): { ciphertext: string; nonce: string; envelope: string } {
  return {
    ciphertext: bytesToBase64(utf8ToBytes(plaintext)),
    nonce: randomBase64(24),
    envelope: randomBase64(48),
  };
}
