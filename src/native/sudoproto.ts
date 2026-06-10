// JS side of the SudoProto FFI shim.
//
// The Rust crypto lives in sdk-rust/ffi/mobile (C ABI: sdk_auth_*). A thin
// per-platform native module (JSI HostObject on iOS/Android, built by
// scripts/build.sh) wraps each C function: it copies the returned SdkBuf into an
// ArrayBuffer, frees it, and throws on a negative status. This file is the typed
// JS contract for that module plus byte-layout decoding — no crypto happens in
// JS (CLAUDE.md: all protocol crypto goes through the Rust engine over FFI).

/** The raw native contract the platform glue must implement over the C ABI. */
export interface SudoprotoNative {
  /** sdk_auth_enroll → 321 B: secret(96) ‖ authHW_pub(65) ‖ idEd_pub(32) ‖ bundle(128). */
  authEnroll(): ArrayBuffer;
  /** sdk_auth_register_proof → 64 B proof. */
  authRegisterProof(secret: ArrayBuffer, phone: string, otp: string): ArrayBuffer;
  /** sdk_auth_open_session → session_sk(32) ‖ session_pub(65) ‖ cert_wire(var). */
  authOpenSession(
    secret: ArrayBuffer,
    account: string,
    issuedAt: number,
    exp: number,
    revEpoch: number,
  ): ArrayBuffer;
  /** sdk_auth_sign_request → 64 B signature (the X-Sig value). */
  authSignRequest(
    sessionSk: ArrayBuffer,
    method: string,
    path: string,
    body: ArrayBuffer,
    inbox: string,
    ts: number,
    nonce: string,
  ): ArrayBuffer;
}

// The native module installs the crypto as a JSI HostObject on the global. We
// trigger that install lazily (the Kotlin/ObjC `install()` is synchronous), then
// read __SudoprotoFFI. Resolving lazily keeps importing this file safe at bundle
// time and in Expo Go (where the native module is simply absent).
let cached: SudoprotoNative | null = null;
function native(): SudoprotoNative {
  if (cached) return cached;
  const g = globalThis as unknown as { __SudoprotoFFI?: SudoprotoNative };
  if (!g.__SudoprotoFFI) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModules } = require('react-native');
    const mod = NativeModules?.SudoprotoFfi;
    // Case 1: the native module isn't in this build (Expo Go, or a dev build
    // made before the module existed / without the .so).
    if (!mod) {
      throw new Error(
        'SudoProto crypto is not in this build. Run `./scripts/build.sh android`, ' +
          'then `npx expo run:android` (a dev build — Expo Go cannot load native code).',
      );
    }
    // Case 2: module present but the JSI install couldn't get the runtime —
    // bridgeless/new-arch returns a null context holder.
    const installed = mod.install?.() === true;
    if (!installed && !g.__SudoprotoFFI) {
      throw new Error(
        'SudoProto JSI install failed — the JS runtime was null (bridgeless / new ' +
          'architecture). Set newArchEnabled=false in android/gradle.properties and rebuild.',
      );
    }
  }
  const out = g.__SudoprotoFFI;
  if (!out) throw new Error('SudoProto native module unavailable.');
  cached = out;
  return out;
}

/** True when the native crypto module is available in this runtime. */
export function isNativeAvailable(): boolean {
  try {
    native();
    return true;
  } catch {
    return false;
  }
}

const u8 = (ab: ArrayBuffer) => new Uint8Array(ab);
const ab = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** UTF-8 encode without relying on TextEncoder (not guaranteed in Hermes). */
export function encodeUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = s.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

/** A fresh enrolment (sign-up). `secret` is persisted; the rest are sent to the relay. */
export interface Enrollment {
  secret: Uint8Array; // 96 — store in the secure keystore
  authhwPub: Uint8Array; // 65 — verify-otp authHW_pk
  idEdPub: Uint8Array; // 32 — verify-otp idEd_pk
  bundle: Uint8Array; // 128 — PUT /auth/keys pubkey_bundle
}

export function enroll(): Enrollment {
  const b = u8(native().authEnroll());
  return {
    secret: b.slice(0, 96),
    authhwPub: b.slice(96, 161),
    idEdPub: b.slice(161, 193),
    bundle: b.slice(193, 321),
  };
}

export function registerProof(secret: Uint8Array, phone: string, otp: string): Uint8Array {
  return u8(native().authRegisterProof(ab(secret), phone, otp));
}

/** A self-issued session. `sessionSk` is secret; `certWire` is the X-Cert value. */
export interface OpenedSession {
  sessionSk: Uint8Array; // 32 — store in the secure keystore
  sessionPub: Uint8Array; // 65 — X-Session-Pub
  certWire: Uint8Array; // var — X-Cert
}

export function openSession(
  secret: Uint8Array,
  account: string,
  issuedAt: number,
  exp: number,
  revEpoch: number,
): OpenedSession {
  const b = u8(native().authOpenSession(ab(secret), account, issuedAt, exp, revEpoch));
  return { sessionSk: b.slice(0, 32), sessionPub: b.slice(32, 97), certWire: b.slice(97) };
}

export function signRequest(
  sessionSk: Uint8Array,
  method: string,
  path: string,
  body: Uint8Array,
  inbox: string,
  ts: number,
  nonce: string,
): Uint8Array {
  return u8(native().authSignRequest(ab(sessionSk), method, path, ab(body), inbox, ts, nonce));
}

// ── base64 (std alphabet, matches the Go relay's encoding/base64.StdEncoding) ──
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0 && i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
