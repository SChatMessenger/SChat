import { create } from 'zustand';
import { ApiError, apiBinaryRequest } from '../api/client';
import { utf8Encode } from '../crypto/primitives';
import { ensurePermission, readDeviceContacts, type DeviceContact } from '../services/contacts';
import { useIdentityStore } from './useIdentityStore';

export type ContactStatus = 'registered' | 'unregistered' | 'unknown';

export type EnrichedContact = DeviceContact & {
  status: ContactStatus;
  inboxId?: string;
  matchedPhone?: string;
};

type ContactsState = {
  contacts: EnrichedContact[];
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
  loaded: boolean;
  syncContacts: (opts?: { force?: boolean }) => Promise<void>;
  reset: () => void;
};

function encodeLookupBatch(phones: string[]): Uint8Array {
  let total = 2;
  const encoded: Uint8Array[] = [];
  for (const p of phones) {
    const bytes = utf8Encode(p);
    if (bytes.length > 255) continue;
    encoded.push(bytes);
    total += 1 + bytes.length;
  }
  const out = new Uint8Array(total);
  out[0] = encoded.length & 0xff;
  out[1] = (encoded.length >>> 8) & 0xff;
  let off = 2;
  for (const e of encoded) {
    out[off] = e.length & 0xff;
    off += 1;
    out.set(e, off);
    off += e.length;
  }
  return out;
}

function decodeLookupResult(
  bytes: Uint8Array,
  phones: string[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (bytes.length < 2) return out;
  const count = bytes[0] | (bytes[1] << 8);
  let off = 2;
  for (let i = 0; i < count; i++) {
    if (off + 2 > bytes.length) break;
    const registered = bytes[off];
    off += 1;
    const len = bytes[off];
    off += 1;
    if (registered === 1 && len > 0) {
      const inbox = new TextDecoder().decode(bytes.subarray(off, off + len));
      if (phones[i]) out.set(phones[i], inbox);
    }
    off += len;
  }
  return out;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  loading: false,
  error: null,
  permissionDenied: false,
  loaded: false,
  syncContacts: async ({ force = false } = {}) => {
    if (get().loading) return;
    if (!force && get().loaded) return;
    const { token, dialCode } = useIdentityStore.getState();
    if (!token) {
      set({ error: 'Not signed in.' });
      return;
    }
    set({ loading: true, error: null });
    try {
      const granted = await ensurePermission();
      if (!granted) {
        set({ loading: false, permissionDenied: true, loaded: true });
        return;
      }
      const device = await readDeviceContacts(dialCode);

      const myInbox = useIdentityStore.getState().inboxId;
      const myFullPhone = useIdentityStore.getState().phone
        ? `${dialCode}${useIdentityStore.getState().phone.replace(/\D/g, '')}`
        : null;

      const phoneSet = new Set<string>();
      for (const c of device) {
        for (const p of c.phones) {
          if (myFullPhone && p === myFullPhone) continue;
          phoneSet.add(p);
        }
      }
      const phones = Array.from(phoneSet);

      let registered = new Map<string, string>();
      if (phones.length > 0) {
        const body = encodeLookupBatch(phones);
        try {
          const res = await apiBinaryRequest(
            'POST',
            '/users/lookup-many',
            body,
            token,
          );
          registered = decodeLookupResult(res, phones);
        } catch (e) {
          if (e instanceof ApiError) {
            set({ error: e.message });
          }
        }
      }

      const enriched: EnrichedContact[] = device.map((c) => {
        let matched: { phone: string; inbox: string } | null = null;
        for (const p of c.phones) {
          if (myInbox && registered.get(p) === myInbox) continue;
          const inbox = registered.get(p);
          if (inbox) {
            matched = { phone: p, inbox };
            break;
          }
        }
        if (matched) {
          return {
            ...c,
            status: 'registered',
            inboxId: matched.inbox,
            matchedPhone: matched.phone,
          };
        }
        return { ...c, status: 'unregistered' };
      });

      enriched.sort((a, b) => {
        if (a.status === b.status) return a.name.localeCompare(b.name);
        return a.status === 'registered' ? -1 : 1;
      });

      set({ loading: false, loaded: true, contacts: enriched, permissionDenied: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Contacts sync failed.';
      set({ loading: false, error: msg });
    }
  },
  reset: () =>
    set({ contacts: [], loading: false, error: null, permissionDenied: false, loaded: false }),
}));
