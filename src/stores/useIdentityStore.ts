import { create } from 'zustand';
import { ApiError, apiPost, apiPut } from '../api/client';
import { generateKeypair } from '../crypto/keys';
import { useBootStore } from './useBootStore';

type IdentityStep = 'phone' | 'code';

type IdentityState = {
  step: IdentityStep;
  phone: string;
  code: string;
  pending: boolean;
  error: string | null;
  token: string | null;
  userId: string | null;
  inboxId: string | null;
  publicKey: string | null;
  secretKey: string | null;
  setPhone: (phone: string) => void;
  setCode: (code: string) => void;
  sendCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
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

function formatPhoneForApi(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return '+' + normalizedPhoneDigits(trimmed);
  return normalizedPhoneDigits(trimmed);
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
  code: '',
  pending: false,
  error: null,
  token: null,
  userId: null,
  inboxId: null,
  publicKey: null,
  secretKey: null,
  setPhone: (phone) => set({ phone, error: null }),
  setCode: (code) => set({ code: code.replace(/\D/g, '').slice(0, 6), error: null }),
  sendCode: async () => {
    const { phone, pending } = get();
    if (pending) return;
    if (!isValidPhone(phone)) {
      set({ error: 'Enter a valid phone number.' });
      return;
    }
    set({ pending: true, error: null });
    try {
      await apiPost<{ sent: boolean }>('/auth/request-otp', {
        phone: formatPhoneForApi(phone),
      });
      set({ pending: false, step: 'code', code: '' });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Could not send code. Check connection.';
      set({ pending: false, error: msg });
    }
  },
  verifyCode: async () => {
    const { phone, code, pending } = get();
    if (pending) return;
    if (!isValidCode(code)) {
      set({ error: 'Enter the 6-digit code.' });
      return;
    }
    set({ pending: true, error: null });
    try {
      const res = await apiPost<VerifyOtpRes>('/auth/verify-otp', {
        phone: formatPhoneForApi(phone),
        otp: code,
      });

      const keys = generateKeypair();
      try {
        await apiPut<{ updated: boolean }>(
          '/auth/keys',
          { public_key: keys.publicKey },
          res.token,
        );
      } catch (keyErr) {
        // Key upload failed — log but still let user in; they can retry later.
        // The chat layer should refuse to send until keys are uploaded.
        console.warn('public key upload failed', keyErr);
      }

      set({
        pending: false,
        token: res.token,
        userId: res.user_id,
        phone: res.phone,
        inboxId: res.inbox_id,
        publicKey: keys.publicKey,
        secretKey: keys.secretKey,
      });
      useBootStore.getState().succeed();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 401
            ? 'Invalid or expired code.'
            : e.message
          : 'Verification failed. Check connection.';
      set({ pending: false, error: msg });
    }
  },
  goBack: () => set({ step: 'phone', code: '', error: null, pending: false }),
  reset: () =>
    set({
      step: 'phone',
      phone: '',
      code: '',
      pending: false,
      error: null,
      token: null,
      userId: null,
      inboxId: null,
      publicKey: null,
      secretKey: null,
    }),
}));
