import { create } from 'zustand';
import {
  ApiError,
  apiBinaryRequest,
  apiJsonPost,
} from '../../services/api/client';
import { clearSiscSigner, configureSiscSigner } from '../../services/api/sisc';
import {
  getProfileBlob,
  putProfileBlob,
  usernameCheck,
  usernameClaim,
} from '../../services/api/profile';
import { hex, unhex } from '../../services/crypto/primitives';
import { decryptProfile, encryptProfile } from '../../services/crypto/profile';
import { p256KeyGen, signRegistration } from '../../services/crypto/sisc';
import { setProfileSyncTrigger } from '../../services/profileSyncBridge';
import {
  identityFingerprint,
  newIdentity,
  publicBundleOf,
  serializeBundle,
} from '../../services/crypto/keys';
import {
  clearSession,
  loadIdentity,
  loadSession,
  passcodeHash,
  saveIdentity,
  saveSession,
} from '../../services/crypto/persist';
import type { IdentitySecretBundle } from '../../services/crypto/keys';
import { useAppStore } from './useAppStore';
import { useBootStore } from './useBootStore';

// Linear sign-in flow (passcode is the account's server-side two-step PIN):
//   phone → code → (new account)               profile  → welcome → app
//                  (existing, has_passcode=true) passcode → welcome → app
//                  (existing, has_passcode=false)          welcome → app
// 'passcodeReset' is the Forgot-passcode detour off 'passcode': a fresh OTP
// clears the account passcode, then → welcome.
type IdentityStep =
  | 'phone'
  | 'code'
  | 'profile'
  | 'passcode'
  | 'passcodeReset'
  | 'welcome';

type UsernameStatus = 'idle' | 'checking' | 'invalid' | 'available' | 'taken';

type IdentityState = {
  step: IdentityStep;
  phone: string;
  dialCode: string;
  code: string;
  pending: boolean;
  error: string | null;
  token: string | null;
  userId: string | null;
  inboxId: string | null;
  identity: IdentitySecretBundle | null;
  fingerprint: string | null;
  hydrated: boolean;
  // New-account profile inputs (only used on the 'profile' step).
  username: string;
  firstName: string;
  lastName: string;
  // Passcode entry buffer, used on the 'passcode' step (verify against server).
  passcode: string;
  usernameStatus: UsernameStatus;
  setPhone: (phone: string) => void;
  setDialCode: (dial: string) => void;
  setCode: (code: string) => void;
  setUsername: (username: string) => void;
  setFirstName: (name: string) => void;
  setLastName: (name: string) => void;
  setPasscode: (passcode: string) => void;
  sendCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
  submitProfile: () => Promise<void>;
  checkUsername: (u: string) => Promise<void>;
  submitPasscode: () => Promise<void>;
  startPasscodeReset: () => Promise<void>;
  submitPasscodeReset: () => Promise<void>;
  cancelPasscodeReset: () => void;
  finishWelcome: () => void;
  hydrateFromStorage: () => Promise<void>;
  goBack: () => void;
  reset: () => void;
  sessionExpired: () => void;
};

function normalizedPhoneDigits(phone: string) {
  return phone.replace(/[^\d]/g, '');
}

function isValidPhone(phone: string) {
  const digits = normalizedPhoneDigits(phone);
  return digits.length >= 8 && digits.length <= 15;
}

function isValidCode(code: string) {
  return /^\d{6}$/.test(code);
}

function isValidUsername(username: string) {
  // a-z 0-9 . - _ + only, 5-32 chars (matches backend utils::phone::normalize_username).
  return /^[a-z0-9._+-]{5,32}$/.test(username.trim().toLowerCase());
}

// SudoProto 3.0 §0.1.4 — sync the owner-encrypted profile to/from the cloud. The
// relay stores only ciphertext; only this device's identity can decrypt it.
async function pushProfile(identity: IdentitySecretBundle): Promise<void> {
  try {
    const a = useAppStore.getState();
    const blob = encryptProfile(identity, {
      username: a.username,
      firstName: a.firstName,
      lastName: a.lastName,
      displayName: a.displayName,
      bio: a.bio,
    });
    await putProfileBlob(blob);
  } catch (e) {
    console.warn('profile upload failed', e);
  }
}

async function pullProfile(identity: IdentitySecretBundle): Promise<void> {
  try {
    const blob = await getProfileBlob();
    if (!blob || blob.length === 0) return;
    const p = decryptProfile(identity, blob);
    if (p) useAppStore.getState().applyCloudProfile(p);
  } catch (e) {
    console.warn('profile download failed', e);
  }
}

function isValidPasscode(pin: string) {
  return /^\d{4,6}$/.test(pin);
}

function formatPhoneForApi(dialCode: string, national: string): string {
  return `${dialCode}${normalizedPhoneDigits(national)}`;
}

export function shortFingerprint(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).slice(0, 4).toUpperCase().padStart(4, '0');
}

type VerifyOtpRes = {
  user_id: string;
  phone: string;
  inbox_id: string;
  is_new: boolean;
  has_passcode: boolean;
  rev_epoch: number;
};

type VerifyPasscodeRes = { ok: boolean };

export const useIdentityStore = create<IdentityState>((set, get) => ({
  step: 'phone',
  phone: '',
  dialCode: '+91',
  code: '',
  pending: false,
  error: null,
  token: null,
  userId: null,
  inboxId: null,
  identity: null,
  fingerprint: null,
  hydrated: false,
  username: '',
  firstName: '',
  lastName: '',
  passcode: '',
  usernameStatus: 'idle',
  hydrateFromStorage: async () => {
    if (get().hydrated) return;
    try {
      const sess = await loadSession();
      const id = sess ? await loadIdentity(sess.userId) : null;
      if (id && sess && sess.authSecHex) {
        // Re-mint the in-memory SISC session certificate from the persisted
        // long-term auth key. `token` is now just a non-null "signed-in" marker.
        configureSiscSigner(sess.userId, unhex(sess.authSecHex), sess.revEpoch ?? 0);
        set({
          identity: id,
          fingerprint: identityFingerprint(publicBundleOf(id)),
          token: sess.userId,
          userId: sess.userId,
          phone: sess.phone,
          inboxId: sess.inboxId,
          hydrated: true,
        });
        void pullProfile(id);
        useBootStore.getState().succeed();
      } else {
        set({ hydrated: true });
      }
    } catch (e) {
      console.warn('hydrate failed', e);
      set({ hydrated: true });
    }
  },
  setPhone: (phone) => set({ phone: phone.replace(/\D/g, ''), error: null }),
  setDialCode: (dialCode) => set({ dialCode, error: null }),
  setCode: (code) => set({ code: code.replace(/\D/g, '').slice(0, 6), error: null }),
  setUsername: (username) =>
    set({
      username: username.toLowerCase().replace(/[^a-z0-9._+-]/g, '').slice(0, 32),
      usernameStatus: 'idle',
      error: null,
    }),
  setFirstName: (firstName) => set({ firstName: firstName.slice(0, 40), error: null }),
  setLastName: (lastName) => set({ lastName: lastName.slice(0, 40), error: null }),
  setPasscode: (passcode) =>
    set({ passcode: passcode.replace(/\D/g, '').slice(0, 6), error: null }),
  sendCode: async () => {
    const { phone, dialCode, pending } = get();
    if (pending) return;
    if (!isValidPhone(phone)) {
      set({ error: 'Enter a valid phone number.' });
      return;
    }
    set({ pending: true, error: null });
    try {
      await apiJsonPost<{ sent: boolean }>('/auth/request-otp', {
        phone: formatPhoneForApi(dialCode, phone),
      });
      set({ pending: false, step: 'code', code: '' });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Could not send code. Check connection.';
      set({ pending: false, error: msg });
    }
  },
  verifyCode: async () => {
    const { phone, dialCode, code, pending } = get();
    if (pending) return;
    if (!isValidCode(code)) {
      set({ error: 'Enter the 6-digit code.' });
      return;
    }
    set({ pending: true, error: null });
    try {
      // SudoProto 3.0: generate this login's P-256 auth key and prove possession
      // of it by signing the OTP challenge. The server binds the public key to
      // the account and returns NO token — we self-issue session certs from here.
      const phoneApi = formatPhoneForApi(dialCode, phone);
      const authKp = p256KeyGen();
      const proof = signRegistration(authKp.sec, authKp.pub, phoneApi, code);
      const res = await apiJsonPost<VerifyOtpRes>('/auth/verify-otp', {
        phone: phoneApi,
        otp: code,
        auth_pubkey: hex(authKp.pub),
        proof: hex(proof),
      });

      // Configure the request signer BEFORE any authenticated call below.
      configureSiscSigner(res.user_id, authKp.sec, res.rev_epoch);

      // Reuse this account's existing keys on re-login (same device); only mint
      // fresh ones for a first-ever login here. Under 3.0 the published material
      // is just the 128-byte identity bundle (no prekey pool), so re-publishing
      // is harmless — but we still skip it for a reused identity since nothing
      // changed.
      let identity = await loadIdentity(res.user_id);
      const isNewIdentity = !identity;
      if (!identity) identity = newIdentity();
      const pub = publicBundleOf(identity);

      // Persist locally and advance the UI IMMEDIATELY. The bundle upload is moved
      // OFF the critical path so sign-in no longer waits on it; it publishes a
      // moment later, well before the user can start a chat.
      try {
        await Promise.all([
          saveIdentity(res.user_id, identity),
          saveSession({
            userId: res.user_id,
            phone: res.phone,
            inboxId: res.inbox_id,
            authSecHex: hex(authKp.sec),
            authPubHex: hex(authKp.pub),
            revEpoch: res.rev_epoch,
          }),
        ]);
      } catch (persistErr) {
        console.warn('identity persist failed', persistErr);
      }

      set({
        pending: false,
        token: res.user_id,
        userId: res.user_id,
        phone: res.phone,
        inboxId: res.inbox_id,
        identity,
        fingerprint: identityFingerprint(pub),
      });

      // Background: publish a brand-new identity's 128-byte directory bundle
      // (idX ‖ idEd ‖ sig). That's the whole key publication under 3.0 — no
      // prekey pool to mint or refill.
      if (isNewIdentity) {
        void (async () => {
          try {
            await apiBinaryRequest('PUT', '/auth/keys', serializeBundle(pub), undefined);
          } catch (keyErr) {
            console.warn('pubkey bundle upload failed', keyErr);
          }
        })();
      }

      // Restore this account's owner-encrypted profile (name/username/bio) from
      // the cloud on an existing-account login; a brand-new account has none yet.
      if (!res.is_new) void pullProfile(identity);

      // Mirror the account's server-side passcode state into local settings so
      // the toggle and gate agree.
      useAppStore.getState().setSecurity('appPasscode', res.has_passcode);

      // Fork on what the server tells us: a brand-new account collects a
      // profile; an already-registered one with a two-step passcode must enter
      // it; otherwise straight to welcome.
      if (res.is_new) {
        set({ step: 'profile', error: null });
        return;
      }
      if (res.has_passcode) {
        set({ step: 'passcode', passcode: '', error: null });
        return;
      }
      set({ step: 'welcome', error: null });
    } catch (e) {
      console.warn('verifyCode failed', e);
      const msg =
        e instanceof ApiError
          ? e.status === 401
            ? 'Invalid or expired code.'
            : e.message
          : 'Verification failed. Check connection.';
      set({ pending: false, error: msg });
    }
  },
  checkUsername: async (u: string) => {
    if (!isValidUsername(u)) {
      set({ usernameStatus: 'invalid' });
      return;
    }
    set({ usernameStatus: 'checking' });
    try {
      const res = await usernameCheck(u);
      // Ignore a stale response if the input changed while it was in flight.
      if (get().username !== u.toLowerCase()) return;
      set({ usernameStatus: res.status });
    } catch {
      set({ usernameStatus: 'idle' });
    }
  },
  submitProfile: async () => {
    const { username, firstName, lastName, pending, identity } = get();
    if (pending) return;
    if (!firstName.trim()) {
      set({ error: 'Enter your first name.' });
      return;
    }
    if (!isValidUsername(username)) {
      set({ error: 'Username must be 5-32 chars: a-z 0-9 . - _ +' });
      return;
    }
    set({ pending: true, error: null });
    // Claim the handle server-side (it validates availability + charset). The
    // username is stored only as SHA-256 (SudoProto 3.0 §0.1.4).
    try {
      await usernameClaim(username);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 400
            ? 'That username is taken or invalid.'
            : e.message
          : 'Could not set username. Check connection.';
      set({ pending: false, usernameStatus: 'taken', error: msg });
      return;
    }
    useAppStore.getState().applySignupProfile({ username, firstName, lastName });
    if (identity) void pushProfile(identity);
    set({ pending: false, step: 'welcome', error: null, usernameStatus: 'available' });
  },
  submitPasscode: async () => {
    const { passcode, pending, token, userId } = get();
    if (pending) return;
    if (!isValidPasscode(passcode)) {
      set({ error: 'Enter a 4-6 digit passcode.' });
      return;
    }
    if (!token || !userId) {
      set({ error: 'Session expired. Start again.' });
      return;
    }
    set({ pending: true, error: null });
    try {
      const res = await apiJsonPost<VerifyPasscodeRes>(
        '/auth/passcode/verify',
        { hash: passcodeHash(userId, passcode) },
        token,
      );
      if (!res.ok) {
        set({ pending: false, passcode: '', error: 'Incorrect passcode.' });
        return;
      }
      set({ pending: false, passcode: '', step: 'welcome', error: null });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not verify. Check connection.';
      set({ pending: false, error: msg });
    }
  },
  startPasscodeReset: async () => {
    // We're past sign-in OTP (which was consumed), so send a fresh one to prove
    // ownership of the number before clearing the passcode. phone is already the
    // full normalized number from verify-otp.
    const { phone, pending } = get();
    if (pending) return;
    set({ pending: true, error: null });
    try {
      await apiJsonPost<{ sent: boolean }>('/auth/request-otp', { phone });
      set({ pending: false, step: 'passcodeReset', code: '' });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Could not send code. Check connection.';
      set({ pending: false, error: msg });
    }
  },
  submitPasscodeReset: async () => {
    const { phone, code, pending } = get();
    if (pending) return;
    if (!isValidCode(code)) {
      set({ error: 'Enter the 6-digit code.' });
      return;
    }
    set({ pending: true, error: null });
    try {
      await apiJsonPost<unknown>('/auth/passcode/reset', { phone, otp: code });
      // Passcode cleared on the account — mirror locally and continue signed in.
      useAppStore.getState().setSecurity('appPasscode', false);
      set({ pending: false, code: '', passcode: '', step: 'welcome', error: null });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 401
            ? 'Invalid or expired code.'
            : e.message
          : 'Reset failed. Check connection.';
      set({ pending: false, error: msg });
    }
  },
  cancelPasscodeReset: () => set({ step: 'passcode', code: '', error: null, pending: false }),
  finishWelcome: () => {
    set({ error: null });
    useBootStore.getState().succeed();
  },
  goBack: () =>
    set({
      step: 'phone',
      code: '',
      passcode: '',
      error: null,
      pending: false,
    }),
  reset: () => {
    // Sign-out clears the active session (back to auth) but KEEPS this account's
    // identity keys + chats in their per-account slots, so signing back in on
    // this device restores them and stays decryptable (cloud-sync feel). A
    // different account simply loads its own slots.
    void clearSession();
    clearSiscSigner();
    // Different account next: wipe the device-local profile/settings mirror so
    // one account's name/passcode-toggle doesn't bleed into another. In-memory
    // chats are cleared by the App effect when inboxId drops to null below
    // (hydrateChats' no-account branch) — done there to avoid a store import
    // cycle (useChatStore already imports useIdentityStore).
    void useAppStore.getState().resetProfile();
    set({
      step: 'phone',
      phone: '',
      dialCode: '+91',
      code: '',
      pending: false,
      error: null,
      token: null,
      userId: null,
      inboxId: null,
      identity: null,
      fingerprint: null,
      username: '',
      firstName: '',
      lastName: '',
      passcode: '',
    });
  },
  sessionExpired: () => {
    // Token expired/rejected — NOT a user-initiated sign-out. Drop only the
    // session (return to OTP) and KEEP the profile, chats, and per-account
    // identity, so re-verifying the same number restores everything. Phone is
    // kept so re-auth is one tap. inboxId→null lets the App effect clear the
    // in-memory chats until re-login reloads them.
    void clearSession();
    clearSiscSigner();
    set({
      step: 'phone',
      code: '',
      passcode: '',
      pending: false,
      error: null,
      token: null,
      userId: null,
      inboxId: null,
      identity: null,
      fingerprint: null,
    });
  },
}));

// Re-upload the owner-encrypted profile whenever local profile data changes
// (debounced). No-op until an identity exists. SudoProto 3.0 §0.1.4.
let profileSyncTimer: ReturnType<typeof setTimeout> | null = null;
setProfileSyncTrigger(() => {
  if (profileSyncTimer) clearTimeout(profileSyncTimer);
  profileSyncTimer = setTimeout(() => {
    const { identity } = useIdentityStore.getState();
    if (identity) void pushProfile(identity);
  }, 1500);
});
