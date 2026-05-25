import {
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  X25519_KEY_BYTES,
  aeadOpen,
  aeadSeal,
  bytesEqual,
  concat,
  hex,
  hkdfDerive,
  hmacSha512,
  padPlaintext,
  unpadPlaintext,
  utf8Encode,
  x25519Dh,
  x25519KeyGen,
  zeroize,
  type X25519Keypair,
} from './primitives';
import { consumeOpkSecret } from './prekeys';
import {
  FRAME_RATCHET,
  type IdentityPublicBundle,
  type IdentitySecretBundle,
  type PeerOpk,
  openBootstrap,
  sealBootstrap,
} from './session';

const RK_INFO = utf8Encode('schat/v1 ratchet rk');
const MK_TAG = new Uint8Array([0x01]);
const CK_TAG = new Uint8Array([0x02]);
const NONCE_TAG = new Uint8Array([0x03]);
const MAX_SKIP = 1000;

const RATCHET_HEADER_BYTES =
  1 + X25519_KEY_BYTES + 4 + 4 + X25519_KEY_BYTES;

export type RatchetState = {
  rootKey: Uint8Array;
  dhSendKp: X25519Keypair;
  dhRecvPub: Uint8Array;
  cks: Uint8Array | null;
  ckr: Uint8Array | null;
  ns: number;
  nr: number;
  pn: number;
  skipped: Map<string, { mk: Uint8Array; nonce: Uint8Array }>;
};

function kdfRK(rk: Uint8Array, dhOut: Uint8Array): { rk: Uint8Array; ck: Uint8Array } {
  const okm = hkdfDerive(dhOut, rk, RK_INFO, 64);
  const out = {
    rk: new Uint8Array(okm.subarray(0, 32)),
    ck: new Uint8Array(okm.subarray(32, 64)),
  };
  zeroize(okm);
  return out;
}

function kdfCK(ck: Uint8Array): {
  mk: Uint8Array;
  nonce: Uint8Array;
  nextCK: Uint8Array;
} {
  const mkFull = hmacSha512(ck, MK_TAG);
  const ckFull = hmacSha512(ck, CK_TAG);
  const nonceFull = hmacSha512(ck, NONCE_TAG);
  const mk = new Uint8Array(mkFull.subarray(0, AEAD_KEY_BYTES));
  const nextCK = new Uint8Array(ckFull.subarray(0, 32));
  const nonce = new Uint8Array(nonceFull.subarray(0, AEAD_NONCE_BYTES));
  zeroize(mkFull, ckFull, nonceFull);
  return { mk, nonce, nextCK };
}

function dhRatchetSend(state: RatchetState): void {
  const oldRk = state.rootKey;
  const oldCks = state.cks;
  const oldCkr = state.ckr;
  const oldSec = state.dhSendKp.sec;

  const dh1 = x25519Dh(state.dhSendKp.sec, state.dhRecvPub);
  const r1 = kdfRK(state.rootKey, dh1);
  zeroize(dh1);
  state.rootKey = r1.rk;
  state.ckr = r1.ck;
  state.dhSendKp = x25519KeyGen();
  const dh2 = x25519Dh(state.dhSendKp.sec, state.dhRecvPub);
  const r2 = kdfRK(state.rootKey, dh2);
  zeroize(dh2, oldRk, oldCks, oldCkr, oldSec);
  state.rootKey = r2.rk;
  state.cks = r2.ck;
  state.pn = state.ns;
  state.ns = 0;
  state.nr = 0;
}

function dhRatchetRecv(state: RatchetState, newDhRecvPub: Uint8Array): void {
  skipMessageKeys(state, state.pn);
  state.pn = state.ns;
  state.ns = 0;
  state.nr = 0;
  state.dhRecvPub = new Uint8Array(newDhRecvPub);

  const oldRk = state.rootKey;
  const oldCks = state.cks;
  const oldCkr = state.ckr;
  const oldSec = state.dhSendKp.sec;

  const dh1 = x25519Dh(state.dhSendKp.sec, state.dhRecvPub);
  const r1 = kdfRK(state.rootKey, dh1);
  zeroize(dh1);
  state.rootKey = r1.rk;
  state.ckr = r1.ck;
  state.dhSendKp = x25519KeyGen();
  const dh2 = x25519Dh(state.dhSendKp.sec, state.dhRecvPub);
  const r2 = kdfRK(state.rootKey, dh2);
  zeroize(dh2, oldRk, oldCks, oldCkr, oldSec);
  state.rootKey = r2.rk;
  state.cks = r2.ck;
}

type SkippedSlot = { mk: Uint8Array; nonce: Uint8Array };

function skipMessageKeys(state: RatchetState, until: number): void {
  if (!state.ckr) return;
  if (until - state.nr > MAX_SKIP) {
    throw new Error('too many skipped messages');
  }
  while (state.nr < until) {
    const r = kdfCK(state.ckr);
    zeroize(state.ckr);
    state.ckr = r.nextCK;
    const key = `${hex(state.dhRecvPub)}|${state.nr}`;
    state.skipped.set(key, { mk: r.mk, nonce: r.nonce });
    state.nr += 1;
  }
}

function tryConsumeSkipped(
  state: RatchetState,
  dhPub: Uint8Array,
  n: number,
): SkippedSlot | null {
  const key = `${hex(dhPub)}|${n}`;
  const slot = state.skipped.get(key);
  if (!slot) return null;
  state.skipped.delete(key);
  return slot;
}

function writeU32LE(out: Uint8Array, off: number, v: number): void {
  out[off] = v & 0xff;
  out[off + 1] = (v >>> 8) & 0xff;
  out[off + 2] = (v >>> 16) & 0xff;
  out[off + 3] = (v >>> 24) & 0xff;
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

function ratchetAad(
  version: number,
  dhPub: Uint8Array,
  pn: number,
  n: number,
  senderIdPub: Uint8Array,
): Uint8Array {
  const header = new Uint8Array(1 + X25519_KEY_BYTES + 4 + 4 + X25519_KEY_BYTES);
  header[0] = version;
  header.set(dhPub, 1);
  writeU32LE(header, 1 + X25519_KEY_BYTES, pn);
  writeU32LE(header, 1 + X25519_KEY_BYTES + 4, n);
  header.set(senderIdPub, 1 + X25519_KEY_BYTES + 8);
  return header;
}

export type InitiatorBootstrap = {
  state: RatchetState;
  frame: Uint8Array;
};

export function bootstrapAsInitiator(
  plaintext: Uint8Array,
  peer: IdentityPublicBundle,
  sender: IdentitySecretBundle,
  peerOpk: PeerOpk | null,
): InitiatorBootstrap {
  const sealed = sealBootstrap(plaintext, peer, sender, peerOpk);
  const state: RatchetState = {
    rootKey: sealed.rootKey,
    dhSendKp: x25519KeyGen(),
    dhRecvPub: new Uint8Array(peer.x25519Pub),
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: new Map(),
  };
  const dh = x25519Dh(state.dhSendKp.sec, state.dhRecvPub);
  const oldRk = state.rootKey;
  const r = kdfRK(state.rootKey, dh);
  zeroize(dh, oldRk);
  state.rootKey = r.rk;
  state.cks = r.ck;
  return { state, frame: sealed.frame };
}

export type ResponderBootstrap = {
  state: RatchetState;
  plaintext: Uint8Array;
  senderX25519Pub: Uint8Array;
};

export function bootstrapAsResponder(
  frame: Uint8Array,
  recipient: IdentitySecretBundle,
): ResponderBootstrap | null {
  const opened = openBootstrap(frame, recipient, (id) => consumeOpkSecret(recipient, id));
  if (!opened) return null;
  const state: RatchetState = {
    rootKey: opened.rootKey,
    dhSendKp: x25519KeyGen(),
    dhRecvPub: new Uint8Array(opened.senderX25519Pub),
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: new Map(),
  };
  const dh = x25519Dh(recipient.x25519.sec, state.dhRecvPub);
  const oldRk = state.rootKey;
  const r = kdfRK(state.rootKey, dh);
  zeroize(dh, oldRk);
  state.rootKey = r.rk;
  state.ckr = r.ck;
  return {
    state,
    plaintext: opened.plaintext,
    senderX25519Pub: opened.senderX25519Pub,
  };
}

export function sealNext(
  state: RatchetState,
  plaintext: Uint8Array,
  sender: IdentitySecretBundle,
): Uint8Array {
  if (!state.cks) {
    dhRatchetSend(state);
  }
  const oldCks = state.cks!;
  const derived = kdfCK(oldCks);
  zeroize(oldCks);
  state.cks = derived.nextCK;
  const n = state.ns;
  state.ns += 1;

  const ad = ratchetAad(FRAME_RATCHET, state.dhSendKp.pub, state.pn, n, sender.x25519.pub);
  const padded = padPlaintext(plaintext);
  const ct = aeadSeal(derived.mk, derived.nonce, ad, padded);
  const out = concat(ad, ct);
  zeroize(padded, derived.mk, derived.nonce);
  return out;
}

export type RatchetOpened = {
  plaintext: Uint8Array;
  senderX25519Pub: Uint8Array;
};

export function openNext(
  state: RatchetState,
  frame: Uint8Array,
): RatchetOpened | null {
  if (frame.length < RATCHET_HEADER_BYTES + 16) return null;
  if (frame[0] !== FRAME_RATCHET) return null;

  let off = 1;
  const dhPub = frame.subarray(off, off + X25519_KEY_BYTES);
  off += X25519_KEY_BYTES;
  const pn = readU32LE(frame, off);
  off += 4;
  const n = readU32LE(frame, off);
  off += 4;
  const senderIdPub = frame.subarray(off, off + X25519_KEY_BYTES);
  off += X25519_KEY_BYTES;
  const ct = frame.subarray(off);
  const ad = frame.subarray(0, RATCHET_HEADER_BYTES);

  const slot = tryConsumeSkipped(state, dhPub, n);
  if (slot) {
    const padded = aeadOpen(slot.mk, slot.nonce, ad, ct);
    zeroize(slot.mk, slot.nonce);
    if (!padded) return null;
    const pt = unpadPlaintext(padded);
    zeroize(padded);
    if (!pt) return null;
    return { plaintext: new Uint8Array(pt), senderX25519Pub: new Uint8Array(senderIdPub) };
  }

  if (!bytesEqual(dhPub, state.dhRecvPub)) {
    skipMessageKeys(state, pn);
    dhRatchetRecv(state, dhPub);
  }
  if (!state.ckr) return null;

  skipMessageKeys(state, n);

  const oldCkr = state.ckr;
  const r = kdfCK(oldCkr);
  zeroize(oldCkr);
  state.ckr = r.nextCK;
  state.nr += 1;

  const padded = aeadOpen(r.mk, r.nonce, ad, ct);
  zeroize(r.mk, r.nonce);
  if (!padded) return null;
  const pt = unpadPlaintext(padded);
  zeroize(padded);
  if (!pt) return null;
  return { plaintext: new Uint8Array(pt), senderX25519Pub: new Uint8Array(senderIdPub) };
}

export function peekVersion(frame: Uint8Array): number {
  return frame.length > 0 ? frame[0] : 0;
}
