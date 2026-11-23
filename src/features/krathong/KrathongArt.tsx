import { memo, useState } from 'react';
import type { KrathongBase, KrathongDesign } from '@/types/domain';
import { KrathongSvg } from './KrathongSvg';
import { flowerPhases } from './options';

/**
 * A krathong built from Blender-rendered part sprites (see blender/krathong.py),
 * stacked back to front. Every sprite shares one camera, so they line up; parts
 * that sit on the plate are nudged up or down to the height of the chosen base.
 * Falls back to the SVG drawing if a sprite fails to load.
 */

// Plate top height (metres) per base, relative to the 0.032 m the parts were rendered on,
// converted to % of sprite height: dz * cos(24deg) * px-per-metre / height.
const PX_PER_M_OVER_H = (640 / 0.31) * Math.cos((24 * Math.PI) / 180) / 552;
const BASE_TOP: Record<KrathongBase, number> = {
  banana_leaf: 0.03,
  banana_rose: 0.03,
  flower: 0.026,
  bread: 0.034,
  banana_trunk: 0.056,
  ice: 0.05,
};

/** Bases with folds or petals round the rim; their near side is a separate sprite. */
const RIM_BASES = new Set<KrathongBase>(['banana_leaf', 'banana_rose', 'flower']);

export interface SpriteLayer {
  key: string;
  src: string;
  /** Sits on the plate, so it moves with the base height. */
  lift: boolean;
}

export function spriteLayers(design: KrathongDesign): SpriteLayer[] {
  const { shape, base, candle, incense, beads, garland, coins } = design;
  const phases = flowerPhases(design.flowers);
  const flowers = (side: 'back' | 'front') =>
    phases.map(({ kind, phase }) => ({
      key: `flower-${side}-${kind}-${phase}`,
      src: `/krathong/flower-${side}-${shape}-${kind}-p${phase}.webp`,
      lift: true,
    }));
  const layers: (SpriteLayer | false)[] = [
    { key: 'base', src: `/krathong/base-${shape}-${base}.webp`, lift: false },
    !!beads && { key: 'beads-back', src: `/krathong/beads-back-${shape}-${beads}.webp`, lift: true },
    garland && { key: 'garland-back', src: `/krathong/garland-back-${shape}.webp`, lift: true },
    ...flowers('back'),
    !!candle && { key: 'candle', src: `/krathong/candle-${candle}.webp`, lift: true },
    incense && { key: 'incense', src: '/krathong/incense.webp', lift: true },
    coins && { key: 'coins', src: `/krathong/coins-${shape}.webp`, lift: true },
    ...flowers('front'),
    !!beads && { key: 'beads-front', src: `/krathong/beads-front-${shape}-${beads}.webp`, lift: true },
    // the near-side folds overlap the front flowers, as on a real krathong
    RIM_BASES.has(base) && { key: 'rim-front', src: `/krathong/rim-front-${shape}-${base}.webp`, lift: false },
    garland && { key: 'garland-front', src: `/krathong/garland-front-${shape}.webp`, lift: true },
  ];
  return layers.filter((l): l is SpriteLayer => !!l);
}

export function liftPercent(base: KrathongBase): number {
  return (BASE_TOP[base] - 0.032) * PX_PER_M_OVER_H * 100;
}

interface Props {
  design: KrathongDesign;
  className?: string;
  /** Flame glow; off for small thumbnails. */
  lit?: boolean;
  title?: string;
}

function KrathongArtImpl({ design, className = '', lit = true, title }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed) return <KrathongSvg design={design} className={className} lit={lit} title={title} />;
  const lift = liftPercent(design.base);
  return (
    <div
      className={`relative aspect-[220/190] ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {lit && design.candle && (
        <span
          aria-hidden
          className="lt-glow pointer-events-none absolute left-1/2 aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_210_130/0.55),rgb(245_199_106/0.12)_45%,transparent_70%)]"
          style={{ top: `${21 - lift}%` }}
        />
      )}
      {spriteLayers(design).map((layer) => (
        <img
          key={layer.key}
          src={layer.src}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailed(true)}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          style={layer.lift && lift ? { transform: `translateY(${-lift}%)` } : undefined}
        />
      ))}
    </div>
  );
}

export const KrathongArt = memo(KrathongArtImpl);
