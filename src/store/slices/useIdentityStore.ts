import { create } from 'zustand';
import {
  ApiError,
  apiBinaryRequest,
  apiJsonPost,
} from '../../services/api/client';
import {
  identityFingerprint,
  newIdentity,
  publicBundleOf,
  serializeBundle,
} from '../../services/crypto/keys';
import {
  OPK_INITIAL_COUNT,
  OPK_REFILL_BATCH,
  OPK_REFILL_THRESHOLD,
  mintOpks,
  serializeOpkUpload,
} from '../../services/crypto/prekeys';
import {
  clearSession,
  loadIdentity,
  loadSession,
  passcodeHash,
  saveIdentity,
  saveSession,
} from '../../services/crypto/persist';
import type { IdentitySecretBundle } from '../../services/crypto/session';
import { useAppStore } from './useAppStore';
import { useBootStore } from './useBootStore';
import { useChatStore } from './useChatStore';

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
  setPhone: (phone: string) => void;
  setDialCode: (dial: string) => void;
  setCode: (code: string) => void;
  setUsername: (username: string) => void;
  setFirstName: (name: string) => void;
  setLastName: (name: string) => void;
  setPasscode: (passcode: string) => void;
  sendCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
  submitProfile: () => void;
  submitPasscode: () => Promise<void>;
  startPasscodeReset: () => Promise<void>;
  submitPasscodeReset: () => Promise<void>;
  cancelPasscodeReset: () => void;
  finishWelcome: () => void;
  hydrateFromStorage: () => Promise<void>;
  refillOpksIfLow: () => Promise<void>;
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
  return /^[a-z0-9_]{3,32}$/.test(username.trim().toLowerCase());
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
  token: string;
  user_id: string;
  phone: string;
  inbox_id: string;
  is_new: boolean;
  has_passcode: boolean;
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
  hydrateFromStorage: async () => {
    if (get().hydrated) return;
    try {
      const sess = await loadSession();
      const id = sess ? await loadIdentity(sess.userId) : null;
      if (id && sess) {
        set({
          identity: id,
          fingerprint: identityFingerprint(publicBundleOf(id)),
          token: sess.token,
          userId: sess.userId,
          phone: sess.phone,
          inboxId: sess.inboxId,
          hydrated: true,
        });
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
    set({ username: username.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 32), error: null }),
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
      const res = await apiJsonPost<VerifyOtpRes>('/auth/verify-otp', {
        phone: formatPhoneForApi(dialCode, phone),
        otp: code,
      });

      // Reuse this account's existing keys on re-login (same device); only mint
      // and publish fresh ones for a first-ever login here. Re-publishing on
      // every login is wrong now: PUT /auth/keys purges all OPKs server-side
      // (SudoProto §7.1), so a reused-identity login must NOT re-PUT — it would
      // wipe the account's prekeys. The server already holds this identity's
      // bundle + OPKs from registration; refillOpksIfLow tops them up.
      let identity = await loadIdentity(res.user_id);
      const isNewIdentity = !identity;
      if (!identity) identity = newIdentity();
      const pub = publicBundleOf(identity);

      if (isNewIdentity) {
        // PUT keys first (purges any stale OPKs), then upload a fresh pool — so
        // a reinstall's prekeys land cleanly instead of colliding with old ones.
        try {
          await apiBinaryRequest('PUT', '/auth/keys', serializeBundle(pub), res.token);
        } catch (keyErr) {
          console.warn('pubkey bundle upload failed', keyErr);
        }
        try {
          const opks = mintOpks(identity, OPK_INITIAL_COUNT);
          await apiBinaryRequest('POST', '/auth/prekeys', serializeOpkUpload(opks), res.token);
        } catch (opkErr) {
          console.warn('opk upload failed', opkErr);
        }
      }

      try {
        await Promise.all([
          saveIdentity(res.user_id, identity),
          saveSession({
            token: res.token,
            userId: res.user_id,
            phone: res.phone,
            inboxId: res.inbox_id,
          }),
        ]);
      } catch (persistErr) {
        console.warn('identity persist failed', persistErr);
      }

      set({
        pending: false,
        token: res.token,
        userId: res.user_id,
        phone: res.phone,
        inboxId: res.inbox_id,
        identity,
        fingerprint: identityFingerprint(pub),
      });

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
  submitProfile: () => {
    const { username, firstName, lastName, pending } = get();
    if (pending) return;
    if (!firstName.trim()) {
      set({ error: 'Enter your first name.' });
      return;
    }
    if (!isValidUsername(username)) {
      set({ error: 'Username must be 3-32 letters, numbers or _.' });
      return;
    }
    useAppStore.getState().applySignupProfile({ username, firstName, lastName });
    set({ step: 'welcome', error: null });
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
  refillOpksIfLow: async () => {
    const { token, identity, userId } = get();
    if (!token || !identity || !userId) return;
    try {
      const countBytes = await apiBinaryRequest(
        'GET',
        '/auth/prekeys/count',
        undefined,
        token,
      );
      if (countBytes.length < 4) return;
      const unclaimed =
        (countBytes[0] |
          (countBytes[1] << 8) |
          (countBytes[2] << 16) |
          (countBytes[3] << 24)) >>>
        0;
      if (unclaimed >= OPK_REFILL_THRESHOLD) return;
      const fresh = mintOpks(identity, OPK_REFILL_BATCH);
      await apiBinaryRequest(
        'POST',
        '/auth/prekeys',
        serializeOpkUpload(fresh),
        token,
      );
      await saveIdentity(userId, identity);
    } catch (e) {
      console.warn('opk refill failed', e);
    }
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
    // Different account next: wipe the device-local profile/settings mirror so
    // one account's name/passcode-toggle doesn't bleed into another, and clear
    // in-memory chats immediately so the next account never sees them.
    void useAppStore.getState().resetProfile();
    useChatStore.getState().clearLocal();
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
