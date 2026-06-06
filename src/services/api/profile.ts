// @username + encrypted-profile API (SudoProto 3.0, §0.1.4).
//
// The server stores only SHA-256(username) and an opaque encrypted profile blob,
// so none of these reveal readable data at rest. `s.me/<username>` and @search
// both resolve via `usernameResolveRaw`.
import { apiBinaryRequest, apiJsonGet, apiJsonPut } from './client';

export type UsernameStatus = 'invalid' | 'available' | 'taken';

/// Live availability for the sign-up handle picker.
export function usernameCheck(u: string): Promise<{ status: UsernameStatus }> {
  return apiJsonGet(`/users/username/check?u=${encodeURIComponent(u)}`);
}

/// Claims a handle for the signed-in account. Throws ApiError (400) if taken/invalid.
export function usernameClaim(username: string): Promise<void> {
  return apiJsonPut('/users/username', { username });
}

/// Resolves @username / s.me to a peer bundle (same wire format as phone lookup).
export function usernameResolveRaw(u: string): Promise<Uint8Array> {
  return apiBinaryRequest(
    'GET',
    `/users/username/resolve?u=${encodeURIComponent(u)}`,
    undefined,
    undefined,
  );
}

/// Uploads the owner-encrypted profile ciphertext.
export function putProfileBlob(blob: Uint8Array): Promise<Uint8Array> {
  return apiBinaryRequest('PUT', '/auth/profile', blob, undefined);
}

/// Downloads the owner-encrypted profile ciphertext (empty if never set).
export function getProfileBlob(): Promise<Uint8Array> {
  return apiBinaryRequest('GET', '/auth/profile', undefined, undefined);
}

/// Uploads the owner-encrypted chat-state ciphertext (history + ratchet state).
export function putStateBlob(blob: Uint8Array): Promise<Uint8Array> {
  return apiBinaryRequest('PUT', '/auth/state', blob, undefined);
}

/// Downloads the owner-encrypted chat-state ciphertext (empty if never set).
export function getStateBlob(): Promise<Uint8Array> {
  return apiBinaryRequest('GET', '/auth/state', undefined, undefined);
}
