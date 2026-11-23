import { useEffect, useRef } from 'react';
import { Music2, VolumeX } from 'lucide-react';
import { create } from 'zustand';

/**
 * The Loy Krathong song, played from YouTube with the player hidden (owner's decision,
 * made knowing YouTube's terms ask for a visible player and that YouTube may refuse
 * to play it). The iframe is created on the first user tap so the browser allows
 * sound, then stays mounted outside the routes and is paused or resumed through the
 * IFrame API's postMessage commands.
 */
const VIDEO_ID = '95s3Y8nVMV4';

type SongState = {
  started: boolean;
  playing: boolean;
  start: () => void;
  toggle: () => void;
};

export const useSongStore = create<SongState>((set, get) => ({
  started: false,
  playing: false,
  start: () => {
    if (!get().started) set({ started: true, playing: true });
  },
  toggle: () => {
    const { started, playing } = get();
    if (!started) set({ started: true, playing: true });
    else set({ playing: !playing });
  },
}));

export function SongButton({ className = '' }: { className?: string }) {
  const { playing, toggle } = useSongStore();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      aria-label={playing ? 'ปิดเพลงลอยกระทง' : 'เปิดเพลงลอยกระทง'}
      className={`inline-flex size-12 items-center justify-center rounded-full border bg-night/50 backdrop-blur-sm transition-colors hover:border-gold/60 hover:text-gold ${
        playing ? 'border-gold/70 text-gold' : 'border-ink/15 text-ink'
      } ${className}`}
    >
      {playing ? <Music2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
    </button>
  );
}

function sendCommand(frame: HTMLIFrameElement | null, play: boolean) {
  frame?.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func: play ? 'playVideo' : 'pauseVideo', args: [] }),
    'https://www.youtube-nocookie.com',
  );
}

export function SongPlayer() {
  const { started, playing } = useSongStore();
  const frame = useRef<HTMLIFrameElement>(null);

  // Commands sent before the player loads are dropped, so onLoad replays the current state.
  useEffect(() => {
    sendCommand(frame.current, playing);
  }, [playing]);

  if (!started) return null;
  const src = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&loop=1&playlist=${VIDEO_ID}&playsinline=1&enablejsapi=1&controls=0&rel=0`;
  return (
    <iframe
      ref={frame}
      title="เพลงลอยกระทง"
      src={src}
      aria-hidden="true"
      tabIndex={-1}
      allow="autoplay; encrypted-media"
      onLoad={() => window.setTimeout(() => sendCommand(frame.current, useSongStore.getState().playing), 800)}
      className="pointer-events-none fixed -left-[2px] -top-[2px] size-px opacity-0"
    />
  );
}
