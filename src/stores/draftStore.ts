import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DESIGN, normalizeDesign } from '@/features/krathong/options';
import type { KrathongDesign, WishVisibility } from '@/types/domain';

type DraftState = {
  design: KrathongDesign;
  krathongName: string;
  wish: string;
  visibility: WishVisibility;
  setPart: <K extends keyof KrathongDesign>(key: K, value: KrathongDesign[K]) => void;
  setField: (patch: Partial<Pick<DraftState, 'krathongName' | 'wish' | 'visibility'>>) => void;
  resetDesign: () => void;
  clear: () => void;
};

/** The krathong being built survives a refresh, so a wish is never lost mid-typing. */
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      design: DEFAULT_DESIGN,
      krathongName: '',
      wish: '',
      visibility: 'private',
      setPart: (key, value) => set((s) => ({ design: { ...s.design, [key]: value } })),
      setField: (patch) => set(patch),
      resetDesign: () => set({ design: DEFAULT_DESIGN }),
      clear: () => set({ design: DEFAULT_DESIGN, krathongName: '', wish: '', visibility: 'private' }),
    }),
    {
      name: 'loynamkan:draft',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DraftState>;
        return {
          ...current,
          ...p,
          design: normalizeDesign(p.design),
          visibility: p.visibility === 'public' ? 'public' : 'private',
        };
      },
    },
  ),
);
