import { memo, useState } from 'react';
import { KrathongSvg } from '@/features/krathong/KrathongSvg';
import type { Krathong } from '@/types/domain';
import { driftDelaySeconds, floatParams } from './motion';

interface ItemProps {
  krathong: Krathong;
  isMine: boolean;
  justFloated: boolean;
  interactive: boolean;
  onSelect?: (k: Krathong) => void;
}

const FloatingItem = memo(function FloatingItem({
  krathong,
  isMine,
  justFloated,
  interactive,
  onSelect,
}: ItemProps) {
  const params = floatParams(krathong.id);
  // Computed once when the element mounts, which is when its CSS animation starts.
  const [delay] = useState(() =>
    driftDelaySeconds(params, Date.parse(krathong.floatedAt), Date.now()),
  );
  const lane = params.lane;
  // Far bank sits higher and smaller.
  const size = `calc(4.4rem + ${(lane * 5.6).toFixed(2)}rem)`;

  const style = {
    top: `${(lane * 78).toFixed(2)}%`,
    zIndex: Math.round(lane * 100),
    '--drift': `${params.duration.toFixed(1)}s`,
    '--drift-delay': `${delay.toFixed(2)}s`,
  } as React.CSSProperties;

  const body = (
    <div
      className="lt-bob relative"
      style={{ width: size, '--bob': `${params.bobDuration.toFixed(2)}s`, '--tilt': `${params.tilt.toFixed(1)}deg` } as React.CSSProperties}
    >
      {justFloated && (
        <span
          aria-hidden
          className="lt-ripple absolute left-1/2 top-[78%] -ml-[50%] h-[30%] w-full rounded-[50%] border-2 border-gold/70"
        />
      )}
      <div className={justFloated ? 'lt-release' : undefined}>
        <KrathongSvg design={krathong.design} className="block h-auto w-full drop-shadow-[0_10px_18px_rgb(0_0_0/0.45)]" />
      </div>
      {(isMine || justFloated) && (
        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-night/70 px-2 py-0.5 text-[11px] text-gold">
          กระทงของคุณ
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
          aria-label={`กระทง ${krathong.krathongName} ของ ${krathong.displayName}`}
        >
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
});

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
  return (
    <div className={`absolute inset-x-0 top-[53%] bottom-[16%] ${className}`}>
      {krathongs.map((k) => (
        <FloatingItem
          key={k.id}
          krathong={k}
          isMine={k.ownerId === myId}
          justFloated={k.id === justFloatedId}
          interactive={interactive}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
