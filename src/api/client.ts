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

async function request<T>(
  method: Method,
  path: string,
  body: unknown | undefined,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
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

export function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>('POST', path, body, token);
}

export function apiPut<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>('PUT', path, body, token);
}

export function apiGet<T>(path: string, token?: string): Promise<T> {
  return request<T>('GET', path, undefined, token);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
