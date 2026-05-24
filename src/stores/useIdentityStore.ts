import { create } from 'zustand';
import { useBootStore } from './useBootStore';

type IdentityStep = 'phone' | 'code';

type IdentityState = {
  step: IdentityStep;
  phone: string;
  code: string;
  pending: boolean;
  error: string | null;
  setPhone: (phone: string) => void;
  setCode: (code: string) => void;
  sendCode: () => void;
  verifyCode: () => void;
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

export function shortFingerprint(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).slice(0, 4).toUpperCase().padStart(4, '0');
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  step: 'phone',
  phone: '',
  code: '',
  pending: false,
  error: null,
  setPhone: (phone) => set({ phone, error: null }),
  setCode: (code) => set({ code: code.replace(/\D/g, '').slice(0, 6), error: null }),
  sendCode: () => {
    const { phone, pending } = get();
    if (pending) return;
    if (!isValidPhone(phone)) {
      set({ error: 'Enter a valid phone number.' });
      return;
    }
    set({ pending: true, error: null });
    setTimeout(() => {
      set({ pending: false, step: 'code', code: '' });
    }, 600);
  },
  verifyCode: () => {
    const { code, pending } = get();
    if (pending) return;
    if (!isValidCode(code)) {
      set({ error: 'Enter the 6-digit code.' });
      return;
    }
    set({ pending: true, error: null });
    setTimeout(() => {
      set({ pending: false });
      useBootStore.getState().succeed();
    }, 600);
  },
  goBack: () => set({ step: 'phone', code: '', error: null, pending: false }),
  reset: () =>
    set({ step: 'phone', phone: '', code: '', pending: false, error: null }),
}));
