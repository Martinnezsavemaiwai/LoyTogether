import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BLANK_DESIGN, MAX_FLOWERS, normalizeDesign } from '@/features/krathong/options';
import type { KrathongDesign, KrathongFlower, WishVisibility } from '@/types/domain';

type DraftState = {
  design: KrathongDesign;
  wish: string;
  visibility: WishVisibility;
  setPart: <K extends keyof KrathongDesign>(key: K, value: KrathongDesign[K]) => void;
  toggleFlower: (kind: KrathongFlower) => void;
  /** Replace the whole design at once, e.g. a random one. */
  setDesign: (design: KrathongDesign) => void;
  /** Sets or removes the money; none drops the key rather than storing undefined. */
  setMoney: (money: number | undefined) => void;
  setField: (patch: Partial<Pick<DraftState, 'wish' | 'visibility'>>) => void;
  resetDesign: () => void;
  clear: () => void;
};

/** The krathong being built survives a refresh, so a wish is never lost mid-typing. */
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      design: BLANK_DESIGN,
      wish: '',
      visibility: 'private',
      setPart: (key, value) => set((s) => ({ design: { ...s.design, [key]: value } })),
      toggleFlower: (kind) =>
        set((s) => {
          const has = s.design.flowers.includes(kind);
          if (!has && s.design.flowers.length >= MAX_FLOWERS) return s;
          const flowers = has ? s.design.flowers.filter((f) => f !== kind) : [...s.design.flowers, kind];
          return { design: { ...s.design, flowers } };
        }),
      setDesign: (design) => set({ design }),
      setMoney: (money) =>
        set((s) => {
          const { money: _old, ...rest } = s.design;
          void _old;
          return { design: money ? { ...rest, money } : rest };
        }),
      setField: (patch) => set(patch),
      resetDesign: () => set({ design: BLANK_DESIGN }),
      // After floating: the wish and the money go with that krathong; the decorations stay
      // so "ลอยอีกใบ" starts from the last look.
      clear: () =>
        set((s) => {
          const { money: _old, ...rest } = s.design;
          void _old;
          return { wish: '', visibility: 'private', design: { ...rest, coins: false } };
        }),
    }),
    {
      name: 'loynamkan:draft',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DraftState>;
        return {
          ...current,
          ...p,
          // A first visit starts bare; a draft in progress comes back as it was left.
          design: p.design ? normalizeDesign(p.design) : BLANK_DESIGN,
          visibility: p.visibility === 'public' ? 'public' : 'private',
        };
      },
    },
  ),
);
