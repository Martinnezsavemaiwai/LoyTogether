import { useEffect, useRef, useState } from 'react';
import { Music2, VolumeX } from 'lucide-react';
import { create } from 'zustand';

/**
 * The Loy Krathong song, played from YouTube with the player hidden (owner's decision,
 * made knowing YouTube's terms ask for a visible player and that YouTube may refuse
 * to play it). The player stays mounted outside the routes and is paused or resumed
 * through the IFrame API's postMessage commands.
 *
 * To avoid a long wait after the first tap, the player is loaded paused in the
 * background once the page is idle (`warmUp`), unless the visitor has data saver on.
 * Commands go out only after the player says it is ready, so none are dropped.
 */
const VIDEO_ID = '95s3Y8nVMV4';
const ORIGIN = 'https://www.youtube-nocookie.com';

type SongState = {
  /** The visitor has asked for music at least once. */
  started: boolean;
  playing: boolean;
  /** The hidden player has been created (maybe still paused). */
  mounted: boolean;
  start: () => void;
  toggle: () => void;
  warmUp: () => void;
};

export const useSongStore = create<SongState>((set, get) => ({
  started: false,
  playing: false,
  mounted: false,
  start: () => {
    if (!get().started) set({ started: true, playing: true, mounted: true });
  },
  toggle: () => {
    const { started, playing } = get();
    if (!started) set({ started: true, playing: true, mounted: true });
    else set({ playing: !playing });
  },
  warmUp: () => {
    if (!get().mounted) set({ mounted: true });
  },
}));

/** Loads the paused player in the background once the page has settled. */
export function useSongWarmUp() {
  const warmUp = useSongStore((s) => s.warmUp);
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    // Data saver or a slow link: load the player only when the visitor asks for music.
    if (conn?.saveData || (conn?.effectiveType && /(^|-)2g|3g/.test(conn.effectiveType))) return;
    let idle = 0;
    let timer = 0;
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(warmUp, { timeout: 4000 });
      else timer = window.setTimeout(warmUp, 1500);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      window.removeEventListener('load', schedule);
      if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, [warmUp]);
}

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

function post(frame: HTMLIFrameElement | null, message: object) {
  frame?.contentWindow?.postMessage(JSON.stringify(message), ORIGIN);
}

export function SongPlayer() {
  const mounted = useSongStore((st) => st.mounted);
  return mounted ? <HiddenPlayer /> : null;
}

function HiddenPlayer() {
  const playing = useSongStore((st) => st.playing);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);

  // Decided when the player is created: autoplay only if a tap created it.
  const [src] = useState(
    () => `${ORIGIN}/embed/${VIDEO_ID}?autoplay=${useSongStore.getState().playing ? 1 : 0}&loop=1&playlist=${VIDEO_ID}&playsinline=1&enablejsapi=1&controls=0&rel=0`,
  );

  const attempts = useRef(0);
  const sync = () => {
    if (attempts.current > 8) return;
    attempts.current += 1;
    post(frame.current, { event: 'command', func: useSongStore.getState().playing ? 'playVideo' : 'pauseVideo', args: [] });
  };

  // The player only talks back after we say we are listening.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== ORIGIN || e.source !== frame.current?.contentWindow) return;
      let data: { event?: string; info?: { playerState?: number } | null } | null;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!data?.event) return;
      // initialDelivery can arrive before the player accepts commands; onReady cannot.
      if (!ready.current && data.event === 'onReady') {
        ready.current = true;
        sync();
        return;
      }
      // Keep nudging until the player reports the state we asked for (1 playing, 2 paused).
      const state = data.info?.playerState;
      if (ready.current && typeof state === 'number') {
        const want = useSongStore.getState().playing;
        if ((want && state !== 1 && state !== 3) || (!want && state === 1)) sync();
      }
    };
    window.addEventListener('message', onMessage);
    // Keep saying hello until the player answers (it ignores messages sent before it loads).
    const hello = window.setInterval(() => {
      if (ready.current) window.clearInterval(hello);
      else post(frame.current, { event: 'listening', id: 1, channel: 'widget' });
    }, 250);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(hello);
    };
  }, []);

  useEffect(() => {
    attempts.current = 0;
    if (ready.current) sync();
    // sync reads the latest state itself
  }, [playing]);

  return (
    <iframe
      ref={frame}
      title="เพลงลอยกระทง"
      src={src}
      aria-hidden="true"
      tabIndex={-1}
      allow="autoplay; encrypted-media"
      className="pointer-events-none fixed -left-[2px] -top-[2px] size-px opacity-0"
    />
  );
}
