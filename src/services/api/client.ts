// Minimal relay transport for the auth flow.
//
// This is the slice of the (deleted) services/api layer that useIdentityStore
// needs: a base URL, the 401 hook App.tsx wires, plain JSON POSTs for the public
// auth endpoints, and SISC-signed requests for authenticated ones. SISC headers
// are produced by the Rust engine over FFI (src/native/sudoproto) — never in JS.

import * as Crypto from 'expo-crypto';
import { encodeUtf8, signRequest, toBase64 } from '../../native/sudoproto';

// Relay base URL from .env. EXPO_PUBLIC_API_URL is the project convention;
// EXPO_PUBLIC_RELAY_URL is accepted as an alias. On the Android emulator the host
// loopback is http://10.0.2.2:8080; on a physical device use your LAN IP.
export const RELAY_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  process.env.EXPO_PUBLIC_RELAY_URL ??
  'http://localhost:8080'
).replace(/\/$/, '');

let unauthorized: (() => void) | null = null;

/** App.tsx installs a handler invoked when any signed request gets a 401. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorized = fn;
}

export interface ApiResult<T = unknown> {
  status: number;
  data: T;
  ok: boolean;
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data: data as T, ok: res.status >= 200 && res.status < 300 };
}

/** POST a JSON body to a public endpoint (request-otp, verify-otp). */
export async function postJson<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(RELAY_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

/**
 * PUT a JSON body to a settings endpoint. TODO: this must be SISC-signed via the
 * session (like signedRequest) once those endpoints exist; for now it best-effort
 * PUTs and never throws, so settings screens build/run. `token` is the local
 * logged-in marker, not a server token.
 */
export async function apiJsonPut<T = unknown>(
  path: string,
  body: unknown,
  _token?: string | null,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(RELAY_URL + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return parse<T>(res);
  } catch {
    return { status: 0, data: null as T, ok: false };
  }
}

/** The session material a signed request binds to. */
export interface SignContext {
  sessionSk: Uint8Array;
  sessionPub: Uint8Array;
  certWire: Uint8Array;
  inbox?: string;
}

function nonceHex(): string {
  const b = Crypto.getRandomBytes(16);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Make a SISC-signed request. The body is serialized once and signed over its
 * exact bytes (the relay verifies H_256(body)); the six SISC headers are built
 * from the session via the engine. A 401 fires the unauthorized handler.
 */
export async function signedRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  ctx: SignContext,
  body?: unknown,
): Promise<ApiResult<T>> {
  // Sign over the exact bytes sent on the wire: the relay verifies H_256(body).
  const json = body === undefined ? undefined : JSON.stringify(body);
  const bodyBytes = json === undefined ? new Uint8Array(0) : encodeUtf8(json);
  const inbox = ctx.inbox ?? '';
  const ts = Math.floor(Date.now() / 1000);
  const nonce = nonceHex();
  const sig = signRequest(ctx.sessionSk, method, path, bodyBytes, inbox, ts, nonce);

  const res = await fetch(RELAY_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Cert': toBase64(ctx.certWire),
      'X-Session-Pub': toBase64(ctx.sessionPub),
      'X-Ts': String(ts),
      'X-Nonce': nonce,
      'X-Sig': toBase64(sig),
      'X-Inbox': inbox,
    },
    body: json,
  });
  if (res.status === 401) unauthorized?.();
  return parse<T>(res);
}
