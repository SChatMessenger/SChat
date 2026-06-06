// SudoProto 3.0 SISC request signer (client side, §0.1.2).
//
// Holds the in-memory session: a short-lived P-256 session keypair plus the
// certificate that the account's long-term auth key self-issued for it. Every
// authenticated request is signed by the session key over method+path+body+
// inbox+ts+nonce. Nothing here is a bearer token — capture ≠ reuse.
import { hex, randomBytes } from '../crypto/primitives';
import { p256KeyGen, sha256Bytes, signRequest, signSessionCert } from '../crypto/sisc';

const SESSION_TTL_SECS = 30 * 24 * 3600;

type Signer = {
  account: string;
  sessionPub: Uint8Array;
  sessionSec: Uint8Array;
  certExp: number;
  certEpoch: number;
  certSig: Uint8Array;
};

let signer: Signer | null = null;

export function hasSigner(): boolean {
  return signer !== null;
}

export function clearSiscSigner(): void {
  signer = null;
}

/// Mint a fresh ephemeral session keypair and self-issue a certificate for it
/// under the account's long-term auth key. Called at login and on app boot. The
/// long-term key is only used here (never per request), so it can stay isolated.
export function configureSiscSigner(account: string, authSec: Uint8Array, revEpoch: number): void {
  const sk = p256KeyGen();
  const certExp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECS;
  const certSig = signSessionCert(authSec, sk.pub, account, certExp, revEpoch);
  signer = {
    account,
    sessionPub: sk.pub,
    sessionSec: sk.sec,
    certExp,
    certEpoch: revEpoch,
    certSig,
  };
}

/// Build the per-request SISC headers. `bodyBytes` must be the exact bytes the
/// request will send (the server hashes the raw body); `path` may include a query
/// string — only the path portion is signed, matching the server's `uri.path()`.
export function siscHeaders(
  method: string,
  path: string,
  bodyBytes: Uint8Array,
  inbox: string,
): Record<string, string> {
  if (!signer) return {};
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16);
  const bodyHash = sha256Bytes(bodyBytes);
  const sigPath = path.split('?')[0];
  const reqSig = signRequest(signer.sessionSec, method, sigPath, bodyHash, inbox, ts, nonce);
  return {
    'X-Account': signer.account,
    'X-Sess-Pub': hex(signer.sessionPub),
    'X-Exp': String(signer.certExp),
    'X-Epoch': String(signer.certEpoch),
    'X-Cert-Sig': hex(signer.certSig),
    'X-Ts': String(ts),
    'X-Nonce': hex(nonce),
    'X-Req-Sig': hex(reqSig),
  };
}
