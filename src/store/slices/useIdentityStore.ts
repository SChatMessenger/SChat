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
  clearSession,
  loadIdentity,
  loadSession,
  saveIdentity,
  saveSession,
} from '../../services/crypto/persist';
import type { IdentitySecretBundle } from '../../services/crypto/session';
import { useBootStore } from './useBootStore';

type IdentityStep = 'phone' | 'code';

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
  setPhone: (phone: string) => void;
  setDialCode: (dial: string) => void;
  setCode: (code: string) => void;
  sendCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
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
      useBootStore.getState().succeed();
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
  goBack: () => set({ step: 'phone', code: '', error: null, pending: false }),
  reset: () => {
    void clearIdentity();
    void clearSession();
    void clearChats();
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
    });
  },
}));
