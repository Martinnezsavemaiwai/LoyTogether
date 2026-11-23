import { create } from 'zustand';
import { backend, errorMessage } from '@/lib/backend';
import type { Identity } from '@/types/domain';

type IdentityState = {
  identity: Identity | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  ensure: () => Promise<Identity | null>;
  rename: (name: string) => Promise<void>;
};

export const useIdentityStore = create<IdentityState>((set, get) => ({
  identity: null,
  status: 'idle',
  error: null,

  async ensure() {
    const current = get();
    if (current.identity) return current.identity;
    set({ status: 'loading', error: null });
    try {
      const identity = await backend.ensureIdentity();
      set({ identity, status: 'ready' });
      return identity;
    } catch (err) {
      set({ status: 'error', error: errorMessage(err) });
      return null;
    }
  },

  async rename(name) {
    const identity = get().identity;
    if (!identity) return;
    await backend.updateDisplayName(name);
    set({ identity: { ...identity, displayName: name } });
  },
}));
