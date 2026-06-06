// Emits SISC signature vectors from the MOBILE signer so the Rust verifier can
// confirm byte-for-byte cross-stack agreement. Run via the fuzz tsconfig (stub).
import { hex, utf8Encode } from '../src/services/crypto/primitives';
import {
  p256KeyGen,
  sha256Bytes,
  signRegistration,
  signRequest,
  signSessionCert,
} from '../src/services/crypto/sisc';

const kp = p256KeyGen(); // used as both the auth key and the session key here

const phone = '+15555550100';
const otp = '123456';
const proof = signRegistration(kp.sec, kp.pub, phone, otp);

const account = '11111111-2222-3333-4444-555555555555';
const exp = 1900000000;
const epoch = 0;
const cert = signSessionCert(kp.sec, kp.pub, account, exp, epoch);

const bodyHash = sha256Bytes(utf8Encode('the body'));
const ts = 1750000000;
const nonce = new Uint8Array(16).fill(7);
const reqSig = signRequest(kp.sec, 'POST', '/messages', bodyHash, 'inbox-abc', ts, nonce);

console.log(
  JSON.stringify({
    pub: hex(kp.pub),
    phone,
    otp,
    proof: hex(proof),
    account,
    exp,
    epoch,
    cert: hex(cert),
    bodyHash: hex(bodyHash),
    ts,
    nonce: hex(nonce),
    reqSig: hex(reqSig),
  }),
);
