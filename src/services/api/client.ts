import { Platform } from 'react-native';

import { utf8Encode } from '../crypto/primitives';
import { hasSigner, siscHeaders } from './sisc';

function defaultBaseUrl(): string {
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? defaultBaseUrl();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

// Called when an authenticated request (one that sent a token) is rejected with
// 401 — i.e. the login session is expired/invalid. The app registers a handler
// that signs the user out and returns to the auth screen.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

// Only treat a 401 as "session expired" when we actually presented a token;
// unauthenticated 401s (e.g. wrong OTP on verify) must NOT sign anyone out.
function handleAuthFailure(status: number, hadToken: boolean): void {
  if (status === 401 && hadToken) onUnauthorized?.();
}

async function jsonRequest<T>(
  method: Method,
  path: string,
  body: unknown | undefined,
  _token?: string,
): Promise<T> {
  // The server hashes the exact body bytes into the request signature, so we
  // serialize once and sign + send the identical string.
  const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
  const bodyBytes = bodyStr ? utf8Encode(bodyStr) : new Uint8Array(0);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...siscHeaders(method, path, bodyBytes, ''),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    handleAuthFailure(res.status, hasSigner());
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string'
        ? (data as any).error
        : null) ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function apiJsonPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  return jsonRequest<T>('POST', path, body, token);
}

export function apiJsonGet<T>(path: string, token?: string): Promise<T> {
  return jsonRequest<T>('GET', path, undefined, token);
}

export function apiJsonPut<T>(path: string, body: unknown, token?: string): Promise<T> {
  return jsonRequest<T>('PUT', path, body, token);
}

export async function apiBinaryRequest(
  method: Method,
  path: string,
  body: Uint8Array | undefined,
  _token: string | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Uint8Array> {
  // The recipient inbox (sent as X-Inbox-Id on /messages) is bound into the
  // request signature, so it must match what the server reads from the header.
  const inbox = extraHeaders?.['X-Inbox-Id'] ?? extraHeaders?.['x-inbox-id'] ?? '';
  const bodyBytes = body ?? new Uint8Array(0);
  const headers: Record<string, string> = {
    Accept: 'application/octet-stream',
    ...siscHeaders(method, path, bodyBytes, inbox),
    ...(extraHeaders ?? {}),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/octet-stream';

  let wireBody: ArrayBuffer | undefined;
  if (body !== undefined) {
    const ab = new ArrayBuffer(body.byteLength);
    new Uint8Array(ab).set(body);
    wireBody = ab;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: wireBody,
  });

  if (!res.ok) {
    handleAuthFailure(res.status, hasSigner());
    const text = await res.text();
    let message = `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === 'string') message = parsed.error;
    } catch {
      if (text) message = text;
    }
    throw new ApiError(message, res.status);
  }

  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

/// Long-poll: the server *holds* this request open until a message lands for us
/// (or ~25s), then returns — giving near-instant, push-style delivery without a
/// WebSocket. The AbortController timeout (> the server's hold) keeps a dead
/// connection from hanging the loop forever.
export async function apiLongPoll(path: string, timeoutMs: number): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'application/octet-stream',
    ...siscHeaders('GET', path, new Uint8Array(0), ''),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers,
      signal: ctrl.signal,
    });
    if (!res.ok) handleAuthFailure(res.status, hasSigner());
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

