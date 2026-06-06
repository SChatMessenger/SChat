/**
 * Crash-fuzzer for the mobile SudoProto receive paths — the code that actually
 * runs on-device when decoding a frame fetched from the (untrusted) relay.
 *
 * It stands up a real Alice -> Bob live AKE (SudoProto 3.0 §0.1.7) with the
 * genuine X25519/Ed25519/ML-KEM-1024 crypto (RNG stubbed to Node's CSPRNG, see
 * fuzz/stubs), then throws malformed and adversarial frames at the live receive
 * functions: akeRespond / akeFinish (the handshake) and openNext (the ratchet).
 * The single invariant under test: these functions must NEVER throw on hostile
 * input — they return null (drop the frame) instead. A throw escaping openNext
 * used to wedge the entire inbox (see ratchet.ts), so this is a regression guard.
 *
 * Run:  npm run fuzz:crypto
 */
import fc from 'fast-check';

import { newIdentity, peerIdentityOf } from '../src/services/crypto/keys';
import { unpadPlaintext, utf8Encode } from '../src/services/crypto/primitives';
import { akeFinish, akeInit, akeRespond, type AkePending } from '../src/services/crypto/ake';
import {
  type RatchetState,
  openNext,
  sealNext,
} from '../src/services/crypto/ratchet';

const X25519 = 32;
const NUM_RUNS = 1500;

// ---------------------------------------------------------------------------
// Build one real, live AKE session and capture valid frame templates.
// ---------------------------------------------------------------------------
const alice = newIdentity();
const bob = newIdentity();

// AKE_INIT (Alice → Bob), AKE_RESP (Bob → Alice), then both hold a ratchet.
const init = akeInit(peerIdentityOf(bob), alice, 'alice-inbox');
const validAkeInit = init.frame;
const alicePending: AkePending = init.pending;

const responded = akeRespond(validAkeInit, bob);
if (!responded) throw new Error('harness setup invariant: akeRespond failed');
const validAkeResp = responded.frame;
const bobStateTemplate = responded.state;

const finished = akeFinish(validAkeResp, alicePending, alice);
if (!finished) throw new Error('harness setup invariant: akeFinish failed');
// A genuine ratchet frame from Alice, used as a corruption seed.
const validRatchetFrame = sealNext(finished.state, utf8Encode('a real message'), alice);

// openNext mutates its RatchetState (it advances the receive chain even on AEAD
// failure), so each run gets a deep clone of the post-handshake responder state.
function cloneState(s: RatchetState): RatchetState {
  return {
    rootKey: new Uint8Array(s.rootKey),
    dhSendKp: { pub: new Uint8Array(s.dhSendKp.pub), sec: new Uint8Array(s.dhSendKp.sec) },
    dhRecvPub: new Uint8Array(s.dhRecvPub),
    cks: s.cks ? new Uint8Array(s.cks) : null,
    ckr: s.ckr ? new Uint8Array(s.ckr) : null,
    ns: s.ns,
    nr: s.nr,
    pn: s.pn,
    skipped: new Map(
      [...s.skipped].map(([k, v]) => [
        k,
        { mk: new Uint8Array(v.mk), nonce: new Uint8Array(v.nonce) },
      ]),
    ),
  };
}

// akeFinish reads (but never mutates) the pending state, so a shared clone per
// call keeps the harness's pending reusable across runs.
function clonePending(p: AkePending): AkePending {
  return {
    ek: { pub: new Uint8Array(p.ek.pub), sec: new Uint8Array(p.ek.sec) },
    kemSec: new Uint8Array(p.kemSec),
    peerX25519Pub: new Uint8Array(p.peerX25519Pub),
    peerEd25519Pub: new Uint8Array(p.peerEd25519Pub),
  };
}

function writeU32LE(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
  buf[off + 3] = (v >>> 24) & 0xff;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------
const rawBytes = fc.uint8Array({ maxLength: 4096 });

// A structurally-plausible ratchet frame: 0x02 | dhPub(32) | pn | n | id(32) | ct.
// `dhPub` is sometimes the live peer key (same-chain path) and sometimes random
// (forces a DH-ratchet step). `pn`/`n` range over the full u32 so the >MAX_SKIP
// branch — the one that used to throw and wedge the inbox — is hit hard.
const structuredRatchet = fc
  .record({
    useLiveDh: fc.boolean(),
    dhPub: fc.uint8Array({ minLength: X25519, maxLength: X25519 }),
    pn: fc.nat(0xffffffff),
    n: fc.nat(0xffffffff),
    senderId: fc.uint8Array({ minLength: X25519, maxLength: X25519 }),
    ct: fc.uint8Array({ maxLength: 320 }),
  })
  .map((r) => {
    const dh = r.useLiveDh ? bobStateTemplate.dhRecvPub : r.dhPub;
    const frame = new Uint8Array(1 + X25519 + 4 + 4 + X25519 + r.ct.length);
    frame[0] = 0x02;
    frame.set(dh.subarray(0, X25519), 1);
    writeU32LE(frame, 1 + X25519, r.pn);
    writeU32LE(frame, 1 + X25519 + 4, r.n);
    frame.set(r.senderId, 1 + X25519 + 8);
    frame.set(r.ct, 1 + X25519 + 8 + X25519);
    return frame;
  });

// Bit-flip / truncate mutations of a genuine frame, to probe just past valid.
function corrupt(seed: Uint8Array) {
  return fc
    .record({
      flips: fc.array(fc.tuple(fc.nat(Math.max(0, seed.length - 1)), fc.integer({ min: 0, max: 255 })), {
        maxLength: 8,
      }),
      truncate: fc.nat(seed.length),
    })
    .map(({ flips, truncate }) => {
      const out = new Uint8Array(seed.subarray(0, truncate === 0 ? seed.length : truncate));
      for (const [i, v] of flips) if (i < out.length) out[i] = v;
      return out;
    });
}

// ---------------------------------------------------------------------------
// Properties — predicate returns true; any throw fails the property + shrinks.
// ---------------------------------------------------------------------------
function run() {
  console.log(`fuzzing crypto receive paths — ${NUM_RUNS} runs/property`);

  fc.assert(
    fc.property(rawBytes, (data) => {
      unpadPlaintext(data);
      return true;
    }),
    { numRuns: NUM_RUNS },
  );
  console.log('  ok  unpadPlaintext: no throw on arbitrary bytes');

  fc.assert(
    fc.property(fc.oneof(rawBytes, corrupt(validAkeInit)), (frame) => {
      // Responder path: verifies σ_A and ML-KEM-encapsulates to an attacker-chosen
      // public key — both must be caught, never thrown.
      akeRespond(frame, bob);
      return true;
    }),
    { numRuns: NUM_RUNS },
  );
  console.log('  ok  akeRespond: no throw on raw + corrupted AKE_INIT frames');

  fc.assert(
    fc.property(fc.oneof(rawBytes, corrupt(validAkeResp)), (frame) => {
      // Initiator finish: verifies σ_B and ML-KEM-decapsulates an attacker ct.
      akeFinish(frame, clonePending(alicePending), alice);
      return true;
    }),
    { numRuns: NUM_RUNS },
  );
  console.log('  ok  akeFinish: no throw on raw + corrupted AKE_RESP frames');

  fc.assert(
    fc.property(fc.oneof(rawBytes, corrupt(validRatchetFrame), structuredRatchet), (frame) => {
      openNext(cloneState(bobStateTemplate), frame);
      return true;
    }),
    { numRuns: NUM_RUNS },
  );
  console.log('  ok  openNext: no throw on raw + corrupted + huge-skip frames');

  console.log('PASS: all receive paths total (drop-not-crash) under fuzzing');
}

run();
