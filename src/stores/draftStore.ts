import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DESIGN, MAX_FLOWERS, normalizeDesign } from '@/features/krathong/options';
import type { KrathongDesign, KrathongFlower, WishVisibility } from '@/types/domain';

type DraftState = {
  design: KrathongDesign;
  wish: string;
  visibility: WishVisibility;
  /** Money put in the krathong for show: null none, 0 coins without an amount. Never paid or stored. */
  coinAmount: number | null;
  setPart: <K extends keyof KrathongDesign>(key: K, value: KrathongDesign[K]) => void;
  toggleFlower: (kind: KrathongFlower) => void;
  setField: (patch: Partial<Pick<DraftState, 'wish' | 'visibility' | 'coinAmount'>>) => void;
  resetDesign: () => void;
  clear: () => void;
};

/** The krathong being built survives a refresh, so a wish is never lost mid-typing. */
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      design: DEFAULT_DESIGN,
      wish: '',
      visibility: 'private',
      coinAmount: null,
      setPart: (key, value) => set((s) => ({ design: { ...s.design, [key]: value } })),
      toggleFlower: (kind) =>
        set((s) => {
          const has = s.design.flowers.includes(kind);
          if (!has && s.design.flowers.length >= MAX_FLOWERS) return s;
          const flowers = has ? s.design.flowers.filter((f) => f !== kind) : [...s.design.flowers, kind];
          return { design: { ...s.design, flowers } };
        }),
      setField: (patch) => set(patch),
      resetDesign: () => set((s) => ({ design: { ...DEFAULT_DESIGN, coins: s.coinAmount !== null } })),
      clear: () => set({ wish: '', visibility: 'private', coinAmount: null }),
    }),
    {
      name: 'loynamkan:draft',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DraftState>;
        return {
          ...current,
          ...p,
          // coins are not restored, so they never survive a reload on their own
          design: { ...normalizeDesign(p.design), coins: false },
          visibility: p.visibility === 'public' ? 'public' : 'private',
          coinAmount: null,
        };
      },
    },
  ),
);
