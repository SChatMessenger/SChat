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
  clearChats,
  clearIdentity,
  clearPasscode,
  clearSession,
  hasPasscode,
  loadIdentity,
  loadSession,
  saveIdentity,
  savePasscode,
  saveSession,
  verifyPasscode,
} from '../../services/crypto/persist';
import type { IdentitySecretBundle } from '../../services/crypto/session';
import { useAppStore } from './useAppStore';
import { useBootStore } from './useBootStore';

// Linear sign-in flow:
//   phone → code → (new account)          profile  → welcome → app
//                  (existing, passcode on) passcode → welcome → app
//                  (existing, passcode off)           welcome → app
type IdentityStep = 'phone' | 'code' | 'profile' | 'passcode' | 'welcome';

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
  // Passcode entry buffer + whether this device already has a passcode set
  // (enter vs create-on-first-use), used on the 'passcode' step.
  passcode: string;
  passcodeExists: boolean;
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
  finishWelcome: () => void;
  hydrateFromStorage: () => Promise<void>;
  refillOpksIfLow: () => Promise<void>;
  goBack: () => void;
  reset: () => void;
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
};

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
  passcodeExists: false,
  hydrateFromStorage: async () => {
    if (get().hydrated) return;
    try {
      const [id, sess] = await Promise.all([loadIdentity(), loadSession()]);
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

      const identity = newIdentity();
      const pub = publicBundleOf(identity);
      const bundleBytes = serializeBundle(pub);

      try {
        await apiBinaryRequest('PUT', '/auth/keys', bundleBytes, res.token);
      } catch (keyErr) {
        console.warn('pubkey bundle upload failed', keyErr);
      }

      try {
        const opks = mintOpks(identity, OPK_INITIAL_COUNT);
        await apiBinaryRequest('POST', '/auth/prekeys', serializeOpkUpload(opks), res.token);
      } catch (opkErr) {
        console.warn('opk upload failed', opkErr);
      }

      try {
        await Promise.all([
          saveIdentity(identity),
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

      // Fork on what the server tells us: a brand-new account collects a
      // profile; an already-registered one either enters its app passcode (when
      // the device has that setting on) or sails straight to welcome.
      if (res.is_new) {
        set({ step: 'profile', error: null });
        return;
      }
      const passcodeOn = useAppStore.getState().security.appPasscode;
      if (passcodeOn) {
        const exists = await hasPasscode();
        set({ step: 'passcode', passcode: '', passcodeExists: exists, error: null });
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
  submitMpin: async () => {
    const { mpin, mpinExists, pending } = get();
    if (pending) return;
    if (!isValidMpin(mpin)) {
      set({ error: 'Enter a 4-6 digit MPIN.' });
      return;
    }
    set({ pending: true, error: null });
    if (mpinExists) {
      const ok = await verifyMpinHash(mpin);
      if (!ok) {
        set({ pending: false, mpin: '', error: 'Incorrect MPIN.' });
        return;
      }
    } else {
      // First sign-in on this device with the setting on — set the MPIN now.
      await saveMpin(mpin);
    }
    set({ pending: false, mpin: '', step: 'welcome', error: null });
  },
  finishWelcome: () => {
    set({ error: null });
    useBootStore.getState().succeed();
  },
  refillOpksIfLow: async () => {
    const { token, identity } = get();
    if (!token || !identity) return;
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
      await saveIdentity(identity);
    } catch (e) {
      console.warn('opk refill failed', e);
    }
  },
  goBack: () =>
    set({
      step: 'phone',
      code: '',
      mpin: '',
      mpinExists: false,
      error: null,
      pending: false,
    }),
  reset: () => {
    void clearIdentity();
    void clearSession();
    void clearChats();
    void clearMpin();
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
      mpin: '',
      mpinExists: false,
    });
  },
}));
