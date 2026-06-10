import { create } from 'zustand';

// useContactsStore — the device address book ↔ SChat account map.
//
// Rebuilt as a local stub after services/ was deleted. Real sync reads device
// contacts (with permission) and resolves them against the relay's bulk
// blind-index lookup (POST /users/lookup-many) — not wired yet.

export interface EnrichedContact {
  id: string;
  name: string;
  phones: string[];
  matchedPhone?: string;
  username?: string;
  status?: string;
  registered?: boolean;
}

export interface BreakthroughCandidate {
  id: string;
  name: string;
  phone?: string;
}

type ContactsState = {
  contacts: EnrichedContact[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  permissionDenied: boolean;
  syncContacts: (opts?: { passive?: boolean; force?: boolean }) => Promise<void>;
};

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: [],
  loading: false,
  loaded: false,
  error: null,
  permissionDenied: false,
  // TODO: request the contacts permission, read the address book, resolve via
  // POST /users/lookup-many against phone blind indexes.
  syncContacts: async (_opts) => {
    set({ loading: false, loaded: true });
  },
}));
