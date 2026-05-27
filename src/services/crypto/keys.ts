import {
  ED25519_PUB_BYTES,
  ED25519_SIG_BYTES,
  KYBER_PUB_BYTES,
  X25519_KEY_BYTES,
  concat,
  ed25519KeyGen,
  ed25519Sign,
  ed25519Verify,
  fingerprint,
  hex,
  kyberKeyGen,
  safetyNumber,
  unhex,
  x25519KeyGen,
} from './primitives';
import type { IdentityPublicBundle, IdentitySecretBundle } from './session';

export const BUNDLE_BYTES =
  X25519_KEY_BYTES + KYBER_PUB_BYTES + ED25519_PUB_BYTES + X25519_KEY_BYTES + ED25519_SIG_BYTES;

export type SerializedOpk = { id: number; pub: string; sec: string; sig: string };

export type SerializedIdentity = {
  x25519Pub: string;
  x25519Sec: string;
  kyberPub: string;
  kyberSec: string;
  ed25519Pub: string;
  ed25519Sec: string;
  signedPrekeyPub: string;
  signedPrekeySec: string;
  signedPrekeySig: string;
  opkPool?: SerializedOpk[];
  nextOpkId?: number;
};

export function newIdentity(): IdentitySecretBundle {
  const x = x25519KeyGen();
  const k = kyberKeyGen();
  const e = ed25519KeyGen();
  const spk = x25519KeyGen();
  const sig = ed25519Sign(e.sec, spk.pub);
  return {
    x25519: { pub: x.pub, sec: x.sec },
    kyber: { pub: k.pub, sec: k.sec },
    ed25519: { pub: e.pub, sec: e.sec },
    signedPrekey: { pub: spk.pub, sec: spk.sec, sig },
    opkPool: new Map(),
    nextOpkId: 1,
  };
}

export function publicBundleOf(id: IdentitySecretBundle): IdentityPublicBundle {
  return {
    x25519Pub: id.x25519.pub,
    kyberPub: id.kyber.pub,
    ed25519Pub: id.ed25519.pub,
    signedPrekeyPub: id.signedPrekey.pub,
    signedPrekeySig: id.signedPrekey.sig,
  };
}

export function serializeBundle(pub: IdentityPublicBundle): Uint8Array {
  return concat(
    pub.x25519Pub,
    pub.kyberPub,
    pub.ed25519Pub,
    pub.signedPrekeyPub,
    pub.signedPrekeySig,
  );
}

export function deserializeBundle(bytes: Uint8Array): IdentityPublicBundle | null {
  if (bytes.length !== BUNDLE_BYTES) return null;
  let off = 0;
  const x25519Pub = new Uint8Array(bytes.subarray(off, off + X25519_KEY_BYTES));
  off += X25519_KEY_BYTES;
  const kyberPub = new Uint8Array(bytes.subarray(off, off + KYBER_PUB_BYTES));
  off += KYBER_PUB_BYTES;
  const ed25519Pub = new Uint8Array(bytes.subarray(off, off + ED25519_PUB_BYTES));
  off += ED25519_PUB_BYTES;
  const signedPrekeyPub = new Uint8Array(bytes.subarray(off, off + X25519_KEY_BYTES));
  off += X25519_KEY_BYTES;
  const signedPrekeySig = new Uint8Array(bytes.subarray(off, off + ED25519_SIG_BYTES));
  return {
    x25519Pub,
    kyberPub,
    ed25519Pub,
    signedPrekeyPub,
    signedPrekeySig,
  };
}

export function verifyBundleSignature(pub: IdentityPublicBundle): boolean {
  return ed25519Verify(pub.ed25519Pub, pub.signedPrekeyPub, pub.signedPrekeySig);
}

export function serializeIdentity(id: IdentitySecretBundle): SerializedIdentity {
  const opkPool: SerializedOpk[] = [];
  id.opkPool.forEach((slot, k) => {
    opkPool.push({ id: k, pub: hex(slot.pub), sec: hex(slot.sec), sig: hex(slot.sig) });
  });
  return {
    x25519Pub: hex(id.x25519.pub),
    x25519Sec: hex(id.x25519.sec),
    kyberPub: hex(id.kyber.pub),
    kyberSec: hex(id.kyber.sec),
    ed25519Pub: hex(id.ed25519.pub),
    ed25519Sec: hex(id.ed25519.sec),
    signedPrekeyPub: hex(id.signedPrekey.pub),
    signedPrekeySec: hex(id.signedPrekey.sec),
    signedPrekeySig: hex(id.signedPrekey.sig),
    opkPool,
    nextOpkId: id.nextOpkId,
  };
}

export function deserializeIdentity(s: SerializedIdentity): IdentitySecretBundle {
  const opkPool = new Map<number, { pub: Uint8Array; sec: Uint8Array; sig: Uint8Array }>();
  for (const e of s.opkPool ?? []) {
    opkPool.set(e.id, { pub: unhex(e.pub), sec: unhex(e.sec), sig: unhex(e.sig) });
  }
  return {
    x25519: { pub: unhex(s.x25519Pub), sec: unhex(s.x25519Sec) },
    kyber: { pub: unhex(s.kyberPub), sec: unhex(s.kyberSec) },
    ed25519: { pub: unhex(s.ed25519Pub), sec: unhex(s.ed25519Sec) },
    signedPrekey: {
      pub: unhex(s.signedPrekeyPub),
      sec: unhex(s.signedPrekeySec),
      sig: unhex(s.signedPrekeySig),
    },
    opkPool,
    nextOpkId: s.nextOpkId ?? 1,
  };
}

export function identityFingerprint(id: IdentityPublicBundle): string {
  return fingerprint(serializeBundle(id));
}

export function safetyNumberBetween(
  a: IdentityPublicBundle,
  b: IdentityPublicBundle,
): string {
  return safetyNumber(serializeBundle(a), serializeBundle(b));
}
