import {
  ED25519_PUB_BYTES,
  ED25519_SIG_BYTES,
  X25519_KEY_BYTES,
  concat,
  ed25519KeyGen,
  ed25519Sign,
  ed25519Verify,
  fingerprint,
  hex,
  safetyNumber,
  unhex,
  utf8Encode,
  x25519KeyGen,
} from './primitives';

// SudoProto 3.0 identity (§0.1.7): long-term keys ONLY — idX (X25519) and idEd
// (Ed25519). No signed prekey, no one-time prekeys: the live AKE contributes
// fresh ephemerals at handshake time. The directory bundle self-binds idX under
// idEd so a peer who fetches it can confirm the two keys belong together (this
// replaces the old signed-prekey signature).

export type IdentityPublicBundle = {
  x25519Pub: Uint8Array; // idX
  ed25519Pub: Uint8Array; // idEd
  identitySig: Uint8Array; // Sign(idEd, "schat/v3 identity" ‖ idX)
};

export type IdentitySecretBundle = {
  x25519: { pub: Uint8Array; sec: Uint8Array };
  ed25519: { pub: Uint8Array; sec: Uint8Array };
  identitySig: Uint8Array;
};

// The minimal identity a conversation stores for a peer: just the two long-term
// public keys. The directory self-signature is verified once at lookup time and
// then dropped — safety numbers and fingerprints are computed over this 64-byte
// core, which BOTH sides always have (the responder learns it straight from the
// AKE_INIT frame, with no extra directory round-trip).
export type PeerIdentity = {
  x25519Pub: Uint8Array;
  ed25519Pub: Uint8Array;
};

const IDENTITY_CTX = utf8Encode('schat/v3 identity');

// Directory bundle on the wire: idX(32) ‖ idEd(32) ‖ sig(64) = 128 bytes.
export const BUNDLE_BYTES = X25519_KEY_BYTES + ED25519_PUB_BYTES + ED25519_SIG_BYTES;
// Peer core persisted on a conversation: idX(32) ‖ idEd(32) = 64 bytes.
export const PEER_CORE_BYTES = X25519_KEY_BYTES + ED25519_PUB_BYTES;

export type SerializedIdentity = {
  x25519Pub: string;
  x25519Sec: string;
  ed25519Pub: string;
  ed25519Sec: string;
  identitySig: string;
};

export function newIdentity(): IdentitySecretBundle {
  const x = x25519KeyGen();
  const e = ed25519KeyGen();
  const identitySig = ed25519Sign(e.sec, concat(IDENTITY_CTX, x.pub));
  return {
    x25519: { pub: x.pub, sec: x.sec },
    ed25519: { pub: e.pub, sec: e.sec },
    identitySig,
  };
}

export function publicBundleOf(id: IdentitySecretBundle): IdentityPublicBundle {
  return {
    x25519Pub: id.x25519.pub,
    ed25519Pub: id.ed25519.pub,
    identitySig: id.identitySig,
  };
}

export function peerIdentityOf(b: IdentityPublicBundle | IdentitySecretBundle): PeerIdentity {
  if ('x25519' in b) return { x25519Pub: b.x25519.pub, ed25519Pub: b.ed25519.pub };
  return { x25519Pub: b.x25519Pub, ed25519Pub: b.ed25519Pub };
}

export function serializeBundle(pub: IdentityPublicBundle): Uint8Array {
  return concat(pub.x25519Pub, pub.ed25519Pub, pub.identitySig);
}

export function deserializeBundle(bytes: Uint8Array): IdentityPublicBundle | null {
  if (bytes.length !== BUNDLE_BYTES) return null;
  let off = 0;
  const x25519Pub = new Uint8Array(bytes.subarray(off, off + X25519_KEY_BYTES));
  off += X25519_KEY_BYTES;
  const ed25519Pub = new Uint8Array(bytes.subarray(off, off + ED25519_PUB_BYTES));
  off += ED25519_PUB_BYTES;
  const identitySig = new Uint8Array(bytes.subarray(off, off + ED25519_SIG_BYTES));
  return { x25519Pub, ed25519Pub, identitySig };
}

// Verifies the directory self-binding: idEd vouches for idX. Checked once when a
// bundle is pulled from the directory, before the live AKE is started against it.
export function verifyBundleSignature(pub: IdentityPublicBundle): boolean {
  return ed25519Verify(pub.ed25519Pub, concat(IDENTITY_CTX, pub.x25519Pub), pub.identitySig);
}

// 64-byte peer core for fingerprints / safety numbers.
function core(p: PeerIdentity): Uint8Array {
  return concat(p.x25519Pub, p.ed25519Pub);
}

export function serializePeer(p: PeerIdentity): Uint8Array {
  return core(p);
}

export function deserializePeer(bytes: Uint8Array): PeerIdentity | null {
  if (bytes.length !== PEER_CORE_BYTES) return null;
  return {
    x25519Pub: new Uint8Array(bytes.subarray(0, X25519_KEY_BYTES)),
    ed25519Pub: new Uint8Array(bytes.subarray(X25519_KEY_BYTES, PEER_CORE_BYTES)),
  };
}

export function serializeIdentity(id: IdentitySecretBundle): SerializedIdentity {
  return {
    x25519Pub: hex(id.x25519.pub),
    x25519Sec: hex(id.x25519.sec),
    ed25519Pub: hex(id.ed25519.pub),
    ed25519Sec: hex(id.ed25519.sec),
    identitySig: hex(id.identitySig),
  };
}

export function deserializeIdentity(s: SerializedIdentity): IdentitySecretBundle {
  const x = { pub: unhex(s.x25519Pub), sec: unhex(s.x25519Sec) };
  const e = { pub: unhex(s.ed25519Pub), sec: unhex(s.ed25519Sec) };
  // Tolerate identities persisted before the self-sig existed by recomputing it.
  const identitySig = s.identitySig
    ? unhex(s.identitySig)
    : ed25519Sign(e.sec, concat(IDENTITY_CTX, x.pub));
  return { x25519: x, ed25519: e, identitySig };
}

export function identityFingerprint(p: PeerIdentity): string {
  return fingerprint(core(p));
}

export function safetyNumberBetween(a: PeerIdentity, b: PeerIdentity): string {
  return safetyNumber(core(a), core(b));
}
