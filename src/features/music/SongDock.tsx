import { Music2, X } from 'lucide-react';
import { create } from 'zustand';

/**
 * The Loy Krathong song plays from YouTube's own embedded player, which the
 * uploader allows. YouTube's terms require the player to stay visible (at least
 * 200 x 200 px), so it is a small card rather than hidden audio. The dock lives
 * outside the routes so the song keeps playing between pages.
 */
const VIDEO_ID = '95s3Y8nVMV4';

export const useSongStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function SongButton({ className = '' }: { className?: string }) {
  const { open, setOpen } = useSongStore();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      aria-label={open ? 'ปิดเพลงลอยกระทง' : 'เปิดเพลงลอยกระทง'}
      className={`inline-flex size-12 items-center justify-center rounded-full border bg-night/50 backdrop-blur-sm transition-colors hover:border-gold/60 hover:text-gold ${
        open ? 'border-gold/70 text-gold' : 'border-ink/15 text-ink'
      } ${className}`}
    >
      <Music2 className="size-5" aria-hidden />
    </button>
  );
}

export function SongDock() {
  const { open, setOpen } = useSongStore();
  if (!open) return null;
  const src = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&loop=1&playlist=${VIDEO_ID}&playsinline=1&rel=0`;
  return (
    <aside
      aria-label="เพลงลอยกระทง"
      className="lt-rise fixed left-3 top-20 z-[300] w-[13.5rem] overflow-hidden rounded-3xl border border-ink/15 bg-surface/95 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.7)] backdrop-blur-md sm:left-5 sm:top-auto sm:bottom-5 sm:w-[15rem]"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
        <span className="inline-flex items-center gap-2 text-ink">
          <Music2 className="size-4 text-gold" aria-hidden />
          เพลงลอยกระทง
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-mist hover:bg-ink/10 hover:text-ink"
          aria-label="ปิดเพลง"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <iframe
        title="เพลงรำวงลอยกระทง จาก YouTube"
        src={src}
        className="block aspect-square w-full"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </aside>
  );
}
