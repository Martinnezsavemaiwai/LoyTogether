import { Volume2, VolumeX } from 'lucide-react';
import { create } from 'zustand';
import { startAmbient, stopAmbient } from '@/lib/ambientSound';

const useSound = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: false,
  set: (on) => set({ on }),
}));

export function SoundToggle({ className = '' }: { className?: string }) {
  const { on, set } = useSound();
  const toggle = async () => {
    if (on) {
      stopAmbient();
      set(false);
    } else {
      set(await startAmbient());
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'ปิดเสียงน้ำ' : 'เปิดเสียงน้ำ'}
      className={`inline-flex size-12 items-center justify-center rounded-full border border-ink/15 bg-night/50 text-ink backdrop-blur-sm transition-colors hover:border-gold/60 hover:text-gold ${className}`}
    >
      {on ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
    </button>
  );
}
