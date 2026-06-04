import {
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  ED25519_PUB_BYTES,
  ED25519_SIG_BYTES,
  KYBER_CT_BYTES,
  KYBER_PUB_BYTES,
  SHARED_SECRET_BYTES,
  X25519_KEY_BYTES,
  aeadOpen,
  aeadSeal,
  concat,
  hkdfDerive,
  kyberDecap,
  kyberEncap,
  padPlaintext,
  randomBytes,
  unpadPlaintext,
  utf8Encode,
  x25519Dh,
  x25519KeyGen,
  zeroize,
  type X25519Keypair,
} from './primitives';

export const FRAME_BOOTSTRAP = 0x01;
export const FRAME_RATCHET = 0x02;

const OPK_ID_BYTES = 4;
export const BOOTSTRAP_HEADER_BYTES =
  1 +
  OPK_ID_BYTES +
  X25519_KEY_BYTES +
  KYBER_CT_BYTES +
  AEAD_NONCE_BYTES +
  X25519_KEY_BYTES +
  ED25519_PUB_BYTES +
  X25519_KEY_BYTES +
  ED25519_SIG_BYTES;

// v2: root key now folds the proven c1 = DH(IK_A, SPK_B) identity-binding leg
// (SudoProto/Tamarin `kci_resistance`, `responder_bundle_authentication`).
const PQXDH_INFO_SPK = utf8Encode('schat/v2 pqxdh ik+spk x25519+mlkem1024 hkdf-sha512');
const PQXDH_INFO_OPK = utf8Encode('schat/v2 pqxdh ik+spk+opk x25519+mlkem1024 hkdf-sha512');
const BOOTSTRAP_AEAD_INFO = utf8Encode('schat/v1 bootstrap-aead');
const ZERO_SALT = new Uint8Array(64);
const PQXDH_OKM_LEN = 64;

export type OpkSecret = { pub: Uint8Array; sec: Uint8Array; sig: Uint8Array };

export type IdentityPublicBundle = {
  x25519Pub: Uint8Array;
  kyberPub: Uint8Array;
  ed25519Pub: Uint8Array;
  signedPrekeyPub: Uint8Array;
  signedPrekeySig: Uint8Array;
};

export type IdentitySecretBundle = {
  x25519: { pub: Uint8Array; sec: Uint8Array };
  kyber: { pub: Uint8Array; sec: Uint8Array };
  ed25519: { pub: Uint8Array; sec: Uint8Array };
  signedPrekey: { pub: Uint8Array; sec: Uint8Array; sig: Uint8Array };
  opkPool: Map<number, OpkSecret>;
  nextOpkId: number;
};

export type PeerOpk = { id: number; pub: Uint8Array; sig: Uint8Array };

function pqxdhDerive(
  ssIk: Uint8Array,
  ssDh1: Uint8Array,
  ssDh2: Uint8Array | null,
  ssPq: Uint8Array,
): { rootKey: Uint8Array; bootstrapAeadKey: Uint8Array } {
  // Order matches both sides: c1 = DH(IK_A, SPK_B) ‖ DH(EK_A, SPK_B) ‖
  // [DH(EK_A, OPK_B)] ‖ ML-KEM secret. ssIk is the proven identity-binding leg.
  const ikm = ssDh2 ? concat(ssIk, ssDh1, ssDh2, ssPq) : concat(ssIk, ssDh1, ssPq);
  const info = ssDh2 ? PQXDH_INFO_OPK : PQXDH_INFO_SPK;
  const okm = hkdfDerive(ikm, ZERO_SALT, info, PQXDH_OKM_LEN);
  zeroize(ikm);
  const rootKey = new Uint8Array(okm.subarray(0, 32));
  const bootstrapAeadKey = hkdfDerive(rootKey, ZERO_SALT, BOOTSTRAP_AEAD_INFO, AEAD_KEY_BYTES);
  zeroize(okm);
  return { rootKey, bootstrapAeadKey };
}

function writeU32LE(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
  buf[off + 3] = (v >>> 24) & 0xff;
}

function readU32LE(buf: Uint8Array, off: number): number {
  return (
    (buf[off] |
      (buf[off + 1] << 8) |
      (buf[off + 2] << 16) |
      (buf[off + 3] << 24)) >>>
    0
  );
}

function bootstrapAad(
  opkId: number,
  senderIdPub: Uint8Array,
  senderEd25519Pub: Uint8Array,
  senderSpkPub: Uint8Array,
  senderSpkSig: Uint8Array,
): Uint8Array {
  const header = new Uint8Array(1 + OPK_ID_BYTES);
  header[0] = FRAME_BOOTSTRAP;
  writeU32LE(header, 1, opkId);
  return concat(header, senderIdPub, senderEd25519Pub, senderSpkPub, senderSpkSig);
}

export type PqxdhInitiateResult = {
  rootKey: Uint8Array;
  aeadKey: Uint8Array;
  ephem: X25519Keypair;
  kyberCt: Uint8Array;
  usedOpk: boolean;
};

export function pqxdhInitiate(
  recipient: IdentityPublicBundle,
  sender: IdentitySecretBundle,
  recipientOpk: PeerOpk | null,
): PqxdhInitiateResult {
  if (recipient.x25519Pub.length !== X25519_KEY_BYTES) {
    throw new Error('recipient X25519 pub size');
  }
  if (recipient.kyberPub.length !== KYBER_PUB_BYTES) {
    throw new Error('recipient Kyber pub size');
  }
  if (recipient.signedPrekeyPub.length !== X25519_KEY_BYTES) {
    throw new Error('recipient SPK pub size');
  }
  const ephem = x25519KeyGen();
  // c1 = DH(IK_A, SPK_B): binds the initiator's long-term identity (proven leg).
  const ssIk = x25519Dh(sender.x25519.sec, recipient.signedPrekeyPub);
  const ssDh1 = x25519Dh(ephem.sec, recipient.signedPrekeyPub);
  const ssDh2 = recipientOpk ? x25519Dh(ephem.sec, recipientOpk.pub) : null;
  const kem = kyberEncap(recipient.kyberPub);
  if (ssDh1.length !== SHARED_SECRET_BYTES || kem.ss.length !== SHARED_SECRET_BYTES) {
    throw new Error('shared secret size');
  }
  const { rootKey, bootstrapAeadKey } = pqxdhDerive(ssIk, ssDh1, ssDh2, kem.ss);
  zeroize(ssIk, ssDh1, kem.ss);
  if (ssDh2) zeroize(ssDh2);
  return {
    rootKey,
    aeadKey: bootstrapAeadKey,
    ephem,
    kyberCt: kem.ct,
    usedOpk: !!recipientOpk,
  };
}

export function pqxdhRespond(
  recipient: IdentitySecretBundle,
  senderIdPub: Uint8Array,
  ephemPub: Uint8Array,
  kyberCt: Uint8Array,
  opkSecret: OpkSecret | null,
): { rootKey: Uint8Array; aeadKey: Uint8Array } | null {
  let ssIk: Uint8Array;
  let ssDh1: Uint8Array;
  let ssPq: Uint8Array;
  let ssDh2: Uint8Array | null = null;
  try {
    // c1 = DH(SPK_B, IK_A) == initiator's DH(IK_A, SPK_B).
    ssIk = x25519Dh(recipient.signedPrekey.sec, senderIdPub);
    ssDh1 = x25519Dh(recipient.signedPrekey.sec, ephemPub);
    if (opkSecret) ssDh2 = x25519Dh(opkSecret.sec, ephemPub);
    ssPq = kyberDecap(kyberCt, recipient.kyber.sec);
  } catch {
    return null;
  }
  const { rootKey, bootstrapAeadKey } = pqxdhDerive(ssIk, ssDh1, ssDh2, ssPq);
  zeroize(ssIk, ssDh1, ssPq);
  if (ssDh2) zeroize(ssDh2);
  return { rootKey, aeadKey: bootstrapAeadKey };
}

export type BootstrapSealed = {
  frame: Uint8Array;
  rootKey: Uint8Array;
  peerX25519Pub: Uint8Array;
  ephemPub: Uint8Array;
  opkId: number;
};

export function sealBootstrap(
  plaintext: Uint8Array,
  recipient: IdentityPublicBundle,
  sender: IdentitySecretBundle,
  recipientOpk: PeerOpk | null,
): BootstrapSealed {
  const init = pqxdhInitiate(recipient, sender, recipientOpk);
  const nonce = randomBytes(AEAD_NONCE_BYTES);
  const opkId = recipientOpk?.id ?? 0;
  const associated = bootstrapAad(
    opkId,
    sender.x25519.pub,
    sender.ed25519.pub,
    sender.signedPrekey.pub,
    sender.signedPrekey.sig,
  );
  const padded = padPlaintext(plaintext);
  const ct = aeadSeal(init.aeadKey, nonce, associated, padded);
  zeroize(padded, init.aeadKey);

  const versionAndOpk = new Uint8Array(1 + OPK_ID_BYTES);
  versionAndOpk[0] = FRAME_BOOTSTRAP;
  writeU32LE(versionAndOpk, 1, opkId);

  const frame = concat(
    versionAndOpk,
    init.ephem.pub,
    init.kyberCt,
    nonce,
    sender.x25519.pub,
    sender.ed25519.pub,
    sender.signedPrekey.pub,
    sender.signedPrekey.sig,
    ct,
  );
  return {
    frame,
    rootKey: init.rootKey,
    peerX25519Pub: new Uint8Array(recipient.x25519Pub),
    ephemPub: init.ephem.pub,
    opkId,
  };
}

export type BootstrapOpened = {
  plaintext: Uint8Array;
  senderX25519Pub: Uint8Array;
  senderEd25519Pub: Uint8Array;
  senderSpkPub: Uint8Array;
  senderSpkSig: Uint8Array;
  ephemPub: Uint8Array;
  rootKey: Uint8Array;
  opkId: number;
};

export function openBootstrap(
  frame: Uint8Array,
  recipient: IdentitySecretBundle,
  resolveOpkSecret: (id: number) => OpkSecret | null,
): BootstrapOpened | null {
  if (frame.length < BOOTSTRAP_HEADER_BYTES + 16) return null;
  if (frame[0] !== FRAME_BOOTSTRAP) return null;

  let off = 1;
  const opkId = readU32LE(frame, off);
  off += OPK_ID_BYTES;
  const ephemPub = frame.subarray(off, off + X25519_KEY_BYTES);
  off += X25519_KEY_BYTES;
  const kyberCt = frame.subarray(off, off + KYBER_CT_BYTES);
  off += KYBER_CT_BYTES;
  const nonce = frame.subarray(off, off + AEAD_NONCE_BYTES);
  off += AEAD_NONCE_BYTES;
  const senderIdPub = frame.subarray(off, off + X25519_KEY_BYTES);
  off += X25519_KEY_BYTES;
  const senderEd25519Pub = frame.subarray(off, off + ED25519_PUB_BYTES);
  off += ED25519_PUB_BYTES;
  const senderSpkPub = frame.subarray(off, off + X25519_KEY_BYTES);
  off += X25519_KEY_BYTES;
  const senderSpkSig = frame.subarray(off, off + ED25519_SIG_BYTES);
  off += ED25519_SIG_BYTES;
  const aeadCt = frame.subarray(off);

  const opkSecret = opkId !== 0 ? resolveOpkSecret(opkId) : null;

  const r = pqxdhRespond(recipient, senderIdPub, ephemPub, kyberCt, opkSecret);
  if (!r) return null;

  const associated = bootstrapAad(opkId, senderIdPub, senderEd25519Pub, senderSpkPub, senderSpkSig);
  const padded = aeadOpen(r.aeadKey, nonce, associated, aeadCt);
  zeroize(r.aeadKey);
  if (!padded) {
    if (opkSecret) zeroize(opkSecret.sec);
    return null;
  }
  if (opkSecret) zeroize(opkSecret.sec);

  const pt = unpadPlaintext(padded);
  zeroize(padded);
  if (!pt) return null;

  return {
    plaintext: new Uint8Array(pt),
    senderX25519Pub: new Uint8Array(senderIdPub),
    senderEd25519Pub: new Uint8Array(senderEd25519Pub),
    senderSpkPub: new Uint8Array(senderSpkPub),
    senderSpkSig: new Uint8Array(senderSpkSig),
    ephemPub: new Uint8Array(ephemPub),
    rootKey: r.rootKey,
    opkId,
  };
}
