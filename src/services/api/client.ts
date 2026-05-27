import { Platform } from 'react-native';

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

async function jsonRequest<T>(
  method: Method,
  path: string,
  body: unknown | undefined,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
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

export async function apiBinaryRequest(
  method: Method,
  path: string,
  body: Uint8Array | undefined,
  token: string | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Uint8Array> {
  const headers: Record<string, string> = {
    Accept: 'application/octet-stream',
    ...(extraHeaders ?? {}),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/octet-stream';
  if (token) headers.Authorization = `Bearer ${token}`;

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

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

