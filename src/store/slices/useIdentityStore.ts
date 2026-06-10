import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import {
  enroll,
  fromBase64,
  openSession,
  registerProof,
  toBase64,
} from '../../native/sudoproto';
import { postJson, signedRequest, type SignContext } from '../../services/api/client';
import { useBootStore } from './useBootStore';

// useIdentityStore — the sign-in / sign-up flow (SudoProto §6.6 / §11.1).
//
// Crypto goes through the Rust engine over FFI (src/native/sudoproto); the relay
// is reached via services/api/client. There is NO server token — `token` here is
// just a local "logged-in" marker for the UI; auth is keyless (SISC).
//
// Backend coverage today: request-otp / verify-otp / keys are real. Profile,
// username availability, and passcode are local-only with TODOs where their
// relay endpoints (/auth/profile, /users/username, passcode/SVR) don't exist yet.

type Step = 'phone' | 'code' | 'profile' | 'passcode' | 'passcodeReset' | 'welcome';
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export interface IdentityPublic {
  idEdPub: string; // base64 Ed25519 identity key
  authhwPub: string; // base64 SISC authHW key
}

// ── secure-store persistence ──────────────────────────────────────────────────
const K_ENROLL = 'schat.enroll'; // StoredEnroll (secret + publics)
const K_ACCOUNT = 'schat.account'; // StoredAccount
const K_SESSION = 'schat.session'; // StoredSession
const K_PROFILE = 'schat.profile'; // StoredProfile
const K_PASSCODE = 'schat.passcode'; // sha256(passcode) hex, set only if the user opted into two-step

type StoredEnroll = { secret: string; authhwPub: string; idEdPub: string; bundle: string };
type StoredAccount = { accountId: string; deviceId: string; inboxId: string; dialCode: string; phone: string };
type StoredSession = { sessionSk: string; sessionPub: string; certWire: string; exp: number };
type StoredProfile = { firstName: string; lastName: string; username: string };

const getJSON = async <T>(k: string): Promise<T | null> => {
  const v = await SecureStore.getItemAsync(k);
  return v ? (JSON.parse(v) as T) : null;
};
const setJSON = (k: string, v: unknown) => SecureStore.setItemAsync(k, JSON.stringify(v));
const del = (k: string) => SecureStore.deleteItemAsync(k);

const errOf = (data: unknown) => (data as { error?: string })?.error ?? 'Something went wrong';
const usernameBad = (u: string) => !/^[a-z0-9._+-]{5,32}$/.test(u);
const sha256Hex = (s: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

const CERT_TTL_SECS = 30 * 24 * 60 * 60; // 30 days

function ctxFrom(s: StoredSession): SignContext {
  return {
    sessionSk: fromBase64(s.sessionSk),
    sessionPub: fromBase64(s.sessionPub),
    certWire: fromBase64(s.certWire),
  };
}

type IdentityState = {
  step: Step;
  phone: string;
  dialCode: string;
  code: string;
  firstName: string;
  lastName: string;
  username: string;
  passcode: string;
  pending: boolean;
  error: string | null;
  hydrated: boolean;
  usernameStatus: UsernameStatus;
  identity: IdentityPublic | null;
  inboxId: string | null;
  userId: string | null;
  token: string | null;

  setPhone: (v: string) => void;
  setDialCode: (v: string) => void;
  setCode: (v: string) => void;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setUsername: (v: string) => void;
  setPasscode: (v: string) => void;

  sendCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
  goBack: () => void;
  reset: () => void;
  checkUsername: (u: string) => Promise<void>;
  submitProfile: () => Promise<void>;
  submitPasscode: () => Promise<void>;
  startPasscodeReset: () => Promise<void>;
  submitPasscodeReset: () => Promise<void>;
  cancelPasscodeReset: () => void;
  finishWelcome: () => void;
  hydrateFromStorage: () => Promise<void>;
  sessionExpired: () => void;
};

export const useIdentityStore = create<IdentityState>((set, get) => ({
  step: 'phone',
  phone: '',
  dialCode: '+1',
  code: '',
  firstName: '',
  lastName: '',
  username: '',
  passcode: '',
  pending: false,
  error: null,
  hydrated: false,
  usernameStatus: 'idle',
  identity: null,
  inboxId: null,
  userId: null,
  token: null,

  setPhone: (v) => set({ phone: v.replace(/\D/g, ''), error: null }),
  setDialCode: (v) => set({ dialCode: v }),
  setCode: (v) => set({ code: v.replace(/\D/g, '').slice(0, 6), error: null }),
  setFirstName: (v) => set({ firstName: v, error: null }),
  setLastName: (v) => set({ lastName: v }),
  setUsername: (v) => set({ username: v.toLowerCase().replace(/[^a-z0-9._+-]/g, ''), error: null }),
  setPasscode: (v) => set({ passcode: v.replace(/\D/g, '').slice(0, 6), error: null }),

  sendCode: async () => {
    const { phone, dialCode } = get();
    if (phone.length < 6) {
      set({ error: 'Enter a valid phone number' });
      return;
    }
    set({ pending: true, error: null });
    try {
      const r = await postJson('/auth/request-otp', { phone: dialCode + phone });
      if (!r.ok) {
        set({ pending: false, error: errOf(r.data) });
        return;
      }
      set({ pending: false, step: 'code', code: '' });
    } catch {
      set({ pending: false, error: 'Network error. Check your connection.' });
    }
  },

  verifyCode: async () => {
    const { phone, dialCode, code } = get();
    if (code.length < 6) {
      set({ error: 'Enter the 6-digit code' });
      return;
    }
    // Verify needs the Rust crypto (enroll/proof/session). If the native module
    // isn't installed, native() throws a precise, actionable message that the
    // catch below surfaces verbatim.
    set({ pending: true, error: null });
    const fullPhone = dialCode + phone;
    try {
      // 1. Load or create the enrolment (identity + authHW).
      let e = await getJSON<StoredEnroll>(K_ENROLL);
      if (!e) {
        const fresh = enroll();
        e = {
          secret: toBase64(fresh.secret),
          authhwPub: toBase64(fresh.authhwPub),
          idEdPub: toBase64(fresh.idEdPub),
          bundle: toBase64(fresh.bundle),
        };
        await setJSON(K_ENROLL, e);
      }
      const secret = fromBase64(e.secret);

      // 2. Register: prove the OTP under authHW and bind the device.
      const proof = registerProof(secret, fullPhone, code);
      const r = await postJson<{ account_id: string; device_id: string; inbox_id: string }>(
        '/auth/verify-otp',
        {
          phone: fullPhone,
          otp: code,
          authHW_pk: e.authhwPub,
          idEd_pk: e.idEdPub,
          proof: toBase64(proof),
        },
      );
      if (!r.ok) {
        set({ pending: false, error: errOf(r.data) });
        return;
      }
      const { account_id, device_id, inbox_id } = r.data;

      // 3. Self-issue a session and publish the identity bundle.
      const now = Math.floor(Date.now() / 1000);
      const sess = openSession(secret, account_id, now, now + CERT_TTL_SECS, 0);
      const stored: StoredSession = {
        sessionSk: toBase64(sess.sessionSk),
        sessionPub: toBase64(sess.sessionPub),
        certWire: toBase64(sess.certWire),
        exp: now + CERT_TTL_SECS,
      };
      await setJSON(K_SESSION, stored);

      // device_bundle reuses the primary bundle for this first device; dev_cert
      // is empty for now (the FFI doesn't yet expose §6.4 device-cert signing).
      await signedRequest('PUT', '/auth/keys', ctxFrom(stored), {
        pubkey_bundle: e.bundle,
        device_bundle: e.bundle,
        dev_cert: '',
      });

      const account: StoredAccount = {
        accountId: account_id,
        deviceId: device_id,
        inboxId: inbox_id,
        dialCode,
        phone,
      };
      await setJSON(K_ACCOUNT, account);

      set({
        pending: false,
        token: account_id,
        userId: account_id,
        inboxId: inbox_id,
        identity: { idEdPub: e.idEdPub, authhwPub: e.authhwPub },
        step: 'profile',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Native/setup errors (prefixed "SudoProto") are already actionable — show
      // them verbatim so you know exactly what to fix.
      set({ pending: false, error: msg.startsWith('SudoProto') ? msg : `Could not verify: ${msg}` });
    }
  },

  goBack: () => set({ step: 'phone', code: '', error: null }),
  reset: () => set({ phone: '', code: '', error: null, pending: false }),

  checkUsername: async (u) => {
    if (usernameBad(u)) {
      set({ usernameStatus: 'invalid' });
      return;
    }
    set({ usernameStatus: 'checking' });
    // TODO: GET /users/username/check?h=blindIndex — endpoint not built. Optimistic.
    set({ usernameStatus: 'available' });
  },

  submitProfile: async () => {
    const { firstName, lastName, username } = get();
    if (!firstName.trim()) {
      set({ error: 'Enter your first name' });
      return;
    }
    if (username && usernameBad(username)) {
      set({ error: '5–32 chars: a-z 0-9 . - _ +' });
      return;
    }
    set({ pending: true, error: null });
    // TODO: PUT /auth/profile (owner-encrypted blob) + bind username blind index.
    // Backend endpoints not built yet — persist locally for now.
    await setJSON(K_PROFILE, { firstName, lastName, username } satisfies StoredProfile);
    set({ pending: false, step: 'welcome' });
  },

  submitPasscode: async () => {
    const { passcode } = get();
    set({ pending: true, error: null });
    const stored = await SecureStore.getItemAsync(K_PASSCODE);
    if (stored && stored !== (await sha256Hex(passcode))) {
      set({ pending: false, error: 'Incorrect passcode', passcode: '' });
      return;
    }
    set({ pending: false, passcode: '' });
    useBootStore.getState().setPhase('ready');
  },

  startPasscodeReset: async () => {
    const { phone, dialCode } = get();
    set({ pending: true, error: null });
    try {
      await postJson('/auth/request-otp', { phone: dialCode + phone });
    } catch {
      // fall through — the reset screen lets the user retry
    }
    set({ pending: false, step: 'passcodeReset', code: '' });
  },

  submitPasscodeReset: async () => {
    set({ pending: true, error: null });
    // TODO: verify the OTP against a relay reset endpoint (not built). For now,
    // entering the flow clears the local passcode so the user can set a new one.
    await del(K_PASSCODE);
    set({ pending: false, passcode: '' });
    useBootStore.getState().setPhase('ready');
  },

  cancelPasscodeReset: () => set({ step: 'passcode', code: '', error: null }),

  finishWelcome: () => useBootStore.getState().setPhase('ready'),

  hydrateFromStorage: async () => {
    try {
      const [e, account, session, profile, passHash] = await Promise.all([
        getJSON<StoredEnroll>(K_ENROLL),
        getJSON<StoredAccount>(K_ACCOUNT),
        getJSON<StoredSession>(K_SESSION),
        getJSON<StoredProfile>(K_PROFILE),
        SecureStore.getItemAsync(K_PASSCODE),
      ]);

      if (!e || !account) {
        set({ hydrated: true, step: 'phone' });
        return;
      }

      // Returning, enrolled device: refresh the session cert if it's gone/expired.
      let live = session;
      const now = Math.floor(Date.now() / 1000);
      if (!live || live.exp <= now) {
        const sess = openSession(
          fromBase64(e.secret),
          account.accountId,
          now,
          now + CERT_TTL_SECS,
          0,
        );
        live = {
          sessionSk: toBase64(sess.sessionSk),
          sessionPub: toBase64(sess.sessionPub),
          certWire: toBase64(sess.certWire),
          exp: now + CERT_TTL_SECS,
        };
        await setJSON(K_SESSION, live);
      }

      set({
        hydrated: true,
        token: account.accountId,
        userId: account.accountId,
        inboxId: account.inboxId,
        dialCode: account.dialCode,
        phone: account.phone,
        identity: { idEdPub: e.idEdPub, authhwPub: e.authhwPub },
        firstName: profile?.firstName ?? '',
        lastName: profile?.lastName ?? '',
        username: profile?.username ?? '',
      });

      // A two-step passcode gates entry; otherwise go straight to the app.
      if (passHash) {
        set({ step: 'passcode' });
      } else {
        useBootStore.getState().setPhase('ready');
      }
    } catch {
      set({ hydrated: true, step: 'phone' });
    }
  },

  sessionExpired: () => {
    void del(K_SESSION);
    // Keep the identity keys (re-login reuses them); drop the live session.
    set({ token: null, step: 'phone', code: '', passcode: '', error: null });
  },
}));
