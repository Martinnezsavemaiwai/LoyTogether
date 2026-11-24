import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { KrathongArt } from '@/features/krathong/KrathongArt';
import type { Krathong } from '@/types/domain';
import { driftDelaySeconds, floatParams } from './motion';

/** How often the river looks for a public wish to raise. */
const WISH_TICK_MS = 1800;
/** Matches the widest .lt-wish (13.5rem) plus a little air. */
const WISH_HALF_WIDTH = 116;

interface ItemProps {
  krathong: Krathong;
  isMine: boolean;
  justFloated: boolean;
  interactive: boolean;
  wishShowing: boolean;
  onSelect?: (k: Krathong) => void;
  onWishDone: (id: string) => void;
  register: (id: string, el: HTMLElement | null) => void;
}

const FloatingItem = memo(function FloatingItem({
  krathong,
  isMine,
  justFloated,
  interactive,
  wishShowing,
  onSelect,
  onWishDone,
  register,
}: ItemProps) {
  const params = floatParams(krathong.id);
  // Computed once when the element mounts, which is when its CSS animation starts.
  const [delay] = useState(() =>
    driftDelaySeconds(params, Date.parse(krathong.floatedAt), Date.now()),
  );
  const lane = params.lane;
  // Far bank sits higher and smaller.
  const size = `calc(4.4rem + ${(lane * 5.6).toFixed(2)}rem)`;
  const id = krathong.id;
  const bodyRef = useCallback((el: HTMLDivElement | null) => register(id, el), [register, id]);
  // The owner's own fresh wish stays a little longer and shows one more line.
  const ownFresh = justFloated && isMine;

  const style = {
    top: `${(lane * 78).toFixed(2)}%`,
    // A raised wish sits above nearer krathongs so they never cover it.
    zIndex: wishShowing ? 120 : Math.round(lane * 100),
    '--drift': `${params.duration.toFixed(1)}s`,
    '--drift-delay': `${delay.toFixed(2)}s`,
  } as React.CSSProperties;

  const body = (
    <div
      ref={bodyRef}
      className="lt-bob relative"
      style={{ width: size, '--bob': `${params.bobDuration.toFixed(2)}s`, '--tilt': `${params.tilt.toFixed(1)}deg` } as React.CSSProperties}
    >
      {justFloated && (
        <span
          aria-hidden
          className="lt-ripple absolute left-1/2 top-[78%] -ml-[50%] h-[30%] w-full rounded-[50%] border-2 border-gold/70"
        />
      )}
      {wishShowing && krathong.publicWish && (
        <div
          aria-hidden
          className={`lt-wish ${ownFresh ? 'lt-wish-own' : ''}`}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) onWishDone(id);
          }}
        >
          <p className="lt-wish-text">{krathong.publicWish}</p>
          <span className="lt-wish-thread" />
        </div>
      )}
      <div className={justFloated ? 'lt-release' : undefined}>
        <KrathongArt design={krathong.design} className="block h-auto w-full drop-shadow-[0_10px_18px_rgb(0_0_0/0.45)]" />
      </div>
      {krathong.displayName && (
        <span
          className={`lt-nametag ${isMine ? 'lt-nametag-mine' : ''} ${lane < 0.3 ? 'opacity-75' : ''}`}
          style={{ fontSize: `${(0.6875 + lane * 0.1875).toFixed(3)}rem` }}
        >
          {krathong.displayName}
        </span>
      )}
    </div>
  );

  return (
    <div className="lt-lane" style={style}>
      {interactive ? (
        <button
          type="button"
          onClick={() => onSelect?.(krathong)}
          className="pointer-events-auto block cursor-pointer rounded-2xl p-1 transition-transform duration-300 hover:scale-105 focus-visible:scale-105"
          aria-label={isMine ? `กระทงของคุณ (${krathong.displayName})` : `กระทงของ ${krathong.displayName}`}
        >
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
});

/**
 * Raises a few public wishes at a time above their krathongs, taking turns so a
 * busy river stays readable. Only krathongs fully on screen and clear of the
 * wishes already up are chosen; the one just floated goes first.
 */
function useWishRotation(
  krathongs: Krathong[],
  justFloatedId: string | null | undefined,
  rootRef: React.RefObject<HTMLDivElement | null>,
) {
  const [showing, setShowing] = useState<string[]>([]);
  const nodes = useRef(new Map<string, HTMLElement>());
  const lastShown = useRef(new Map<string, number>());
  const listRef = useRef(krathongs);
  const showingRef = useRef(showing);

  useEffect(() => {
    listRef.current = krathongs;
    showingRef.current = showing;
  });

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  }, []);

  const onWishDone = useCallback((id: string) => {
    setShowing((s) => s.filter((x) => x !== id));
  }, []);

  useEffect(() => {
    const tick = () => {
      const root = rootRef.current;
      if (!root || document.hidden) return;
      const max = window.innerWidth >= 768 ? 3 : 2;
      let current = showingRef.current.filter((id) => nodes.current.has(id));
      // A krathong that left the river (reported, trimmed) takes its wish with it.
      if (current.length < showingRef.current.length) setShowing(current);

      const bounds = root.getBoundingClientRect();
      const centre = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top };
      };
      const clash = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.abs(a.x - b.x) < WISH_HALF_WIDTH * 2 && Math.abs(a.y - b.y) < 110;
      const fits = (p: { x: number }) =>
        p.x - WISH_HALF_WIDTH >= bounds.left && p.x + WISH_HALF_WIDTH <= bounds.right;

      // The visitor's own fresh wish goes up first, moving aside any wish in its way.
      const freshKrathong =
        justFloatedId && !lastShown.current.has(justFloatedId)
          ? listRef.current.find((k) => k.id === justFloatedId && k.publicWish)
          : undefined;
      const freshNode = freshKrathong && nodes.current.get(freshKrathong.id);
      if (freshKrathong && freshNode && fits(centre(freshNode))) {
        const p = centre(freshNode);
        current = current.filter((id) => !clash(centre(nodes.current.get(id)!), p)).slice(0, max - 1);
        lastShown.current.set(freshKrathong.id, Date.now());
        setShowing([...current, freshKrathong.id]);
        return;
      }
      if (current.length >= max) return;
      const placed = current.map((id) => centre(nodes.current.get(id)!));

      const candidates = listRef.current
        .filter((k) => k.publicWish && !current.includes(k.id) && nodes.current.has(k.id))
        .sort((a, b) => (lastShown.current.get(a.id) ?? 0) - (lastShown.current.get(b.id) ?? 0));

      for (const k of candidates) {
        const p = centre(nodes.current.get(k.id)!);
        if (!fits(p) || placed.some((q) => clash(q, p))) continue;
        lastShown.current.set(k.id, Date.now());
        setShowing((s) => (s.includes(k.id) ? s : [...s, k.id]));
        return;
      }
    };

    const first = window.setTimeout(tick, justFloatedId ? 1600 : 600);
    const timer = window.setInterval(tick, WISH_TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [justFloatedId, rootRef]);

  return { showing, register, onWishDone };
}

interface FloatingKrathongsProps {
  krathongs: Krathong[];
  myId?: string;
  justFloatedId?: string | null;
  interactive?: boolean;
  onSelect?: (k: Krathong) => void;
  className?: string;
}

export function FloatingKrathongs({
  krathongs,
  myId,
  justFloatedId,
  interactive = true,
  onSelect,
  className = '',
}: FloatingKrathongsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { showing, register, onWishDone } = useWishRotation(krathongs, justFloatedId, rootRef);

  return (
    <div ref={rootRef} className={`absolute inset-x-0 top-[53%] bottom-[16%] ${className}`}>
      {krathongs.map((k) => (
        <FloatingItem
          key={k.id}
          krathong={k}
          isMine={k.ownerId === myId}
          justFloated={k.id === justFloatedId}
          interactive={interactive}
          wishShowing={showing.includes(k.id)}
          onSelect={onSelect}
          onWishDone={onWishDone}
          register={register}
        />
      ))}
    </div>
  );
}
