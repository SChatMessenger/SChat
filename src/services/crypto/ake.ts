// SudoProto 3.0 Live-AKE (§0.1.7) — online interactive handshake that replaces
// the async PQXDH bootstrap. Both peers are connected; each contributes a FRESH
// ephemeral, so there are no prekeys. Two frames over the relay:
//
//   AKE_INIT  A → B :  0x03 ‖ ek_A ‖ kpk_A ‖ idX_A ‖ idEd_A ‖ σ_A ‖ u16(inboxLen) ‖ inbox_A
//   AKE_RESP  B → A :  0x04 ‖ ek_B ‖ ct    ‖ idX_B ‖ idEd_B ‖ σ_B
//
//     σ_A = Sign(idEd_A, "schat/v3 ake-init" ‖ ek_A ‖ kpk_A ‖ idX_A)
//     σ_B = Sign(idEd_B, "schat/v3 ake-resp" ‖ ek_B ‖ ct ‖ idX_B ‖ ek_A)   ← binds ek_A
//
//   RK = HKDF( DH(ek_A,ek_B) ‖ DH(idX_A,ek_B) ‖ DH(ek_A,idX_B) ‖ ML-KEM_ss ,
//              0^64, "schat/v3 live-ake x25519+mlkem hkdf-sha512", 32 )
//
// The inbox_A trailer is routing-only (where B sends AKE_RESP); it is not signed,
// and tampering with it only misroutes the response (the handshake then fails —
// no key is exposed). Machine-checked in cryptographic/sudoproto.spthy.
import {
  ED25519_PUB_BYTES,
  ED25519_SIG_BYTES,
  KYBER_CT_BYTES,
  KYBER_PUB_BYTES,
  X25519_KEY_BYTES,
  bytesEqual,
  concat,
  ed25519Sign,
  ed25519Verify,
  hex,
  hkdfDerive,
  kyberDecap,
  kyberEncap,
  kyberKeyGen,
  unhex,
  utf8Decode,
  utf8Encode,
  x25519Dh,
  x25519KeyGen,
  zeroize,
  type X25519Keypair,
} from './primitives';
import type { IdentitySecretBundle, PeerIdentity } from './keys';
import { ratchetInitInitiator, ratchetInitResponder, type RatchetState } from './ratchet';

export const FRAME_AKE_INIT = 0x03;
export const FRAME_AKE_RESP = 0x04;

const CTX_INIT = utf8Encode('schat/v3 ake-init');
const CTX_RESP = utf8Encode('schat/v3 ake-resp');
const AKE_INFO = utf8Encode('schat/v3 live-ake x25519+mlkem hkdf-sha512');
const ZERO_SALT = new Uint8Array(64);

function rkDerive(ee: Uint8Array, se: Uint8Array, es: Uint8Array, kss: Uint8Array): Uint8Array {
  const ikm = concat(ee, se, es, kss);
  const rk = hkdfDerive(ikm, ZERO_SALT, AKE_INFO, 32);
  zeroize(ikm);
  return rk;
}

function u16le(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
}

// In-flight initiator state, held until the matching AKE_RESP arrives. Persisted
// (serializeAkePending) so a mid-handshake app restart can still finish.
export type AkePending = {
  ek: X25519Keypair; // ek_A
  kemSec: Uint8Array; // ML-KEM ephemeral secret (decapsulation key)
  peerX25519Pub: Uint8Array; // expected idX_B (from the directory lookup)
  peerEd25519Pub: Uint8Array; // expected idEd_B
};

export type AkeInitResult = { frame: Uint8Array; pending: AkePending };

export function akeInit(
  peer: PeerIdentity,
  me: IdentitySecretBundle,
  myInbox: string,
): AkeInitResult {
  const ek = x25519KeyGen();
  const kem = kyberKeyGen(); // kpk_A = kem.pub ; decaps secret = kem.sec
  const idX = me.x25519.pub;
  const idEd = me.ed25519.pub;
  const sig = ed25519Sign(me.ed25519.sec, concat(CTX_INIT, ek.pub, kem.pub, idX));
  const inbox = utf8Encode(myInbox);
  const frame = concat(
    new Uint8Array([FRAME_AKE_INIT]),
    ek.pub,
    kem.pub,
    idX,
    idEd,
    sig,
    u16le(inbox.length),
    inbox,
  );
  return {
    frame,
    pending: {
      ek,
      kemSec: kem.sec,
      peerX25519Pub: new Uint8Array(peer.x25519Pub),
      peerEd25519Pub: new Uint8Array(peer.ed25519Pub),
    },
  };
}

type ParsedInit = {
  ekA: Uint8Array;
  kpkA: Uint8Array;
  idXA: Uint8Array;
  idEdA: Uint8Array;
  sig: Uint8Array;
  senderInbox: string;
};

function parseAkeInit(frame: Uint8Array): ParsedInit | null {
  const fixed = 1 + X25519_KEY_BYTES + KYBER_PUB_BYTES + ED25519_PUB_BYTES + ED25519_PUB_BYTES + ED25519_SIG_BYTES + 2;
  if (frame.length < fixed || frame[0] !== FRAME_AKE_INIT) return null;
  let off = 1;
  const ekA = frame.subarray(off, (off += X25519_KEY_BYTES));
  const kpkA = frame.subarray(off, (off += KYBER_PUB_BYTES));
  const idXA = frame.subarray(off, (off += ED25519_PUB_BYTES));
  const idEdA = frame.subarray(off, (off += ED25519_PUB_BYTES));
  const sig = frame.subarray(off, (off += ED25519_SIG_BYTES));
  const inboxLen = frame[off] | (frame[off + 1] << 8);
  off += 2;
  if (off + inboxLen > frame.length) return null;
  const senderInbox = utf8Decode(frame.subarray(off, off + inboxLen));
  if (!senderInbox) return null;
  return { ekA, kpkA, idXA, idEdA, sig, senderInbox };
}

export type AkeRespondResult = {
  frame: Uint8Array;
  state: RatchetState;
  peer: PeerIdentity; // {idX_A, idEd_A} — authenticated by σ_A
  senderInbox: string;
};

export function akeRespond(
  initFrame: Uint8Array,
  me: IdentitySecretBundle,
): AkeRespondResult | null {
  const p = parseAkeInit(initFrame);
  if (!p) return null;
  // σ_A binds idX_A under idEd_A, so verifying it proves the two identity keys
  // belong to the same party (no separate directory check needed on the responder).
  if (!ed25519Verify(p.idEdA, concat(CTX_INIT, p.ekA, p.kpkA, p.idXA), p.sig)) return null;

  const ekB = x25519KeyGen();
  let kem: { ct: Uint8Array; ss: Uint8Array };
  try {
    kem = kyberEncap(p.kpkA);
  } catch {
    return null;
  }
  const ee = x25519Dh(ekB.sec, p.ekA); // DH(ek_A, ek_B)
  const se = x25519Dh(ekB.sec, p.idXA); // DH(idX_A, ek_B)
  const es = x25519Dh(me.x25519.sec, p.ekA); // DH(ek_A, idX_B)
  const rk = rkDerive(ee, se, es, kem.ss);
  zeroize(ee, se, es, kem.ss);

  const sig = ed25519Sign(
    me.ed25519.sec,
    concat(CTX_RESP, ekB.pub, kem.ct, me.x25519.pub, p.ekA),
  );
  const frame = concat(
    new Uint8Array([FRAME_AKE_RESP]),
    ekB.pub,
    kem.ct,
    me.x25519.pub,
    me.ed25519.pub,
    sig,
  );
  const state = ratchetInitResponder(rk, ekB, p.ekA);
  return {
    frame,
    state,
    peer: { x25519Pub: new Uint8Array(p.idXA), ed25519Pub: new Uint8Array(p.idEdA) },
    senderInbox: p.senderInbox,
  };
}

type ParsedResp = {
  ekB: Uint8Array;
  ct: Uint8Array;
  idXB: Uint8Array;
  idEdB: Uint8Array;
  sig: Uint8Array;
};

function parseAkeResp(frame: Uint8Array): ParsedResp | null {
  const fixed = 1 + X25519_KEY_BYTES + KYBER_CT_BYTES + ED25519_PUB_BYTES + ED25519_PUB_BYTES + ED25519_SIG_BYTES;
  if (frame.length < fixed || frame[0] !== FRAME_AKE_RESP) return null;
  let off = 1;
  const ekB = frame.subarray(off, (off += X25519_KEY_BYTES));
  const ct = frame.subarray(off, (off += KYBER_CT_BYTES));
  const idXB = frame.subarray(off, (off += ED25519_PUB_BYTES));
  const idEdB = frame.subarray(off, (off += ED25519_PUB_BYTES));
  const sig = frame.subarray(off, (off += ED25519_SIG_BYTES));
  return { ekB, ct, idXB, idEdB, sig };
}

export type AkeFinishResult = { state: RatchetState; peer: PeerIdentity };

export function akeFinish(
  respFrame: Uint8Array,
  pending: AkePending,
  me: IdentitySecretBundle,
): AkeFinishResult | null {
  const p = parseAkeResp(respFrame);
  if (!p) return null;
  // The responder must be the exact peer we looked up in the directory (binds the
  // session to the identity whose safety number the user can verify).
  if (
    !bytesEqual(p.idXB, pending.peerX25519Pub) ||
    !bytesEqual(p.idEdB, pending.peerEd25519Pub)
  ) {
    return null;
  }
  // σ_B binds OUR ek_A → a response cannot be reflected/replayed from elsewhere.
  if (
    !ed25519Verify(p.idEdB, concat(CTX_RESP, p.ekB, p.ct, p.idXB, pending.ek.pub), p.sig)
  ) {
    return null;
  }
  let kss: Uint8Array;
  try {
    kss = kyberDecap(p.ct, pending.kemSec);
  } catch {
    return null;
  }
  const ee = x25519Dh(pending.ek.sec, p.ekB); // DH(ek_A, ek_B)
  const se = x25519Dh(me.x25519.sec, p.ekB); // DH(idX_A, ek_B)
  const es = x25519Dh(pending.ek.sec, p.idXB); // DH(ek_A, idX_B)
  const rk = rkDerive(ee, se, es, kss);
  zeroize(ee, se, es, kss);
  const state = ratchetInitInitiator(rk, pending.ek, p.ekB);
  return {
    state,
    peer: { x25519Pub: new Uint8Array(p.idXB), ed25519Pub: new Uint8Array(p.idEdB) },
  };
}

// --- persistence (a handshake in flight must survive an app restart) ---

export type SerializedAkePending = {
  ekPub: string;
  ekSec: string;
  kemSec: string;
  peerX: string;
  peerEd: string;
};

export function serializeAkePending(p: AkePending): SerializedAkePending {
  return {
    ekPub: hex(p.ek.pub),
    ekSec: hex(p.ek.sec),
    kemSec: hex(p.kemSec),
    peerX: hex(p.peerX25519Pub),
    peerEd: hex(p.peerEd25519Pub),
  };
}

export function deserializeAkePending(s: SerializedAkePending): AkePending {
  return {
    ek: { pub: unhex(s.ekPub), sec: unhex(s.ekSec) },
    kemSec: unhex(s.kemSec),
    peerX25519Pub: unhex(s.peerX),
    peerEd25519Pub: unhex(s.peerEd),
  };
}
