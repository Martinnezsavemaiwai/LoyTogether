import { memo, useId, type ReactNode } from 'react';
import type { KrathongDesign, KrathongFlower, KrathongShape } from '@/types/domain';
import { flowerPhases } from './options';

/**
 * A krathong drawn from its parts in a three-quarter view. The plate follows the
 * chosen shape's outline, squashed for perspective. Everything that sits on the
 * plate is split into a back half and a front half around the candle so it
 * overlaps the way a real one does.
 */

const VIEW_W = 220;
const VIEW_H = 190;
const CX = 110;
const CY = 128;
const R = 64;
const SQUASH = 0.42;

type Pt = { x: number; y: number };

/** Outline in unit space (radius about 1), sampled at `n` points from the back. */
export function shapeOutline(shape: KrathongShape, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    if (shape === 'heart') {
      const hx = 16 * Math.sin(t) ** 3;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push({ x: hx / 16, y: -(hy + 2) / 15 });
    } else {
      const r = shape === 'lotus' ? 0.9 + 0.14 * Math.abs(Math.cos(4 * t)) ** 0.6 : 1;
      pts.push({ x: Math.sin(t) * r, y: -Math.cos(t) * r });
    }
  }
  return pts;
}

function project(p: Pt, scale: number, lift = 0): Pt {
  return { x: CX + p.x * R * scale, y: CY + p.y * R * scale * SQUASH - lift };
}

function pathFrom(points: Pt[]): string {
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} Z`;
}

function f(n: number) {
  return n.toFixed(1);
}

const BASE = {
  banana_leaf: { side: '#1d4a2c', rim: '#2f6f42', top: '#4f9a5d', light: '#7cc487', vein: '#24583a' },
  banana_rose: { side: '#1d4a2c', rim: '#357a48', top: '#55a062', light: '#8bd096', vein: '#24583a' },
  flower: { side: '#9c4c69', rim: '#d9839f', top: '#f3c6d3', light: '#fff0f4', vein: '#b9607f' },
  bread: { side: '#8a5426', rim: '#c4843f', top: '#e3b46f', light: '#f6d9a2', vein: '#a86a30' },
  banana_trunk: { side: '#9fae7a', rim: '#d5dfb2', top: '#eef2d6', light: '#ffffff', vein: '#b8c48f' },
  ice: { side: '#8fb8d8', rim: '#cfe8ff', top: '#e8f5ff', light: '#ffffff', vein: '#a8cde8' },
} as const;

const CANDLE = {
  golden: { body: '#f2c260', shade: '#c98f2c' },
  white: { body: '#fbf6ea', shade: '#d6cdb8' },
  pink: { body: '#f4a9c4', shade: '#cf7395' },
  red: { body: '#d8434e', shade: '#9e2633' },
} as const;

const BEAD = {
  gold: '#f5c76a',
  purple: '#b79cff',
  pink: '#ff9fc6',
  pearl: '#fbf7ee',
} as const;

function Flower({ kind, x, y, s }: { kind: KrathongFlower; x: number; y: number; s: number }) {
  const t = `translate(${f(x)} ${f(y)}) scale(${s})`;
  switch (kind) {
    case 'marigold':
      return (
        <g transform={t}>
          <circle r="9.5" fill="#d9741a" />
          {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((a) => (
            <ellipse key={a} cx="0" cy="-6" rx="3.4" ry="4" fill="#f39a2b" transform={`rotate(${a})`} />
          ))}
          <circle r="5" fill="#ffb53d" />
          <circle cx="-2" cy="-2" r="2.2" fill="#ffd36b" />
        </g>
      );
    case 'rose':
      return (
        <g transform={t}>
          <circle r="9" fill="#9c1631" />
          <path d="M-8 1a8 7 0 0 1 16 0z" fill="#c22042" />
          <path d="M-5 0a5 5 0 0 1 10 0a3.4 3.4 0 0 1-6.8 0a1.8 1.8 0 0 1 3.6 0" fill="none" stroke="#6e0b20" strokeWidth="1.3" />
          <ellipse cx="-3" cy="-4" rx="2.2" ry="1.2" fill="#e5556f" />
          <path d="M6 6q6 1 7 6q-6-1-7-6z" fill="#2f7a3f" />
        </g>
      );
    case 'orchid':
      return (
        <g transform={t}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-5.6" rx="3.8" ry="5.8" fill="#9b63d9" transform={`rotate(${a})`} />
          ))}
          {[36, 108, 180, 252, 324].map((a) => (
            <ellipse key={a} cx="0" cy="-4" rx="1.4" ry="3" fill="#c79bf2" transform={`rotate(${a})`} />
          ))}
          <path d="M-2.5 1q2.5 5 5 0q-2.5-2-5 0z" fill="#f5c76a" />
          <circle r="1.6" fill="#fff4ff" />
        </g>
      );
    case 'lotus':
      // A closed lotus bud standing upright.
      return (
        <g transform={t}>
          <path d="M0-20C8-12 9-3 0 4C-9-3-8-12 0-20Z" fill="#f29bbf" />
          <path d="M0-20C4-12 4-3 0 4C-4-3-4-12 0-20Z" fill="#ffc4dc" />
          <path d="M-8-2C-10 3-5 6 0 5C-4 3-7 1-8-2Z" fill="#3f8a50" />
          <path d="M8-2C10 3 5 6 0 5C4 3 7 1 8-2Z" fill="#3f8a50" />
        </g>
      );
    case 'jasmine':
      return (
        <g transform={t}>
          {[
            [-5, -2],
            [4, -4],
            [0, 4],
            [6, 4],
            [-6, 5],
          ].map(([dx, dy], i) => (
            <g key={i} transform={`translate(${dx} ${dy})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx="0" cy="-2.6" rx="1.5" ry="2.6" fill="#fffdf6" transform={`rotate(${a})`} />
              ))}
              <circle r="1" fill="#f1e6b8" />
            </g>
          ))}
        </g>
      );
    case 'chrysanthemum':
      return (
        <g transform={t}>
          {Array.from({ length: 16 }, (_, i) => i * 22.5).map((a) => (
            <ellipse key={a} cx="0" cy="-6.5" rx="1.6" ry="5" fill="#ffe27a" transform={`rotate(${a})`} />
          ))}
          {Array.from({ length: 12 }, (_, i) => i * 30 + 15).map((a) => (
            <ellipse key={a} cx="0" cy="-4" rx="1.3" ry="3.4" fill="#ffd043" transform={`rotate(${a})`} />
          ))}
          <circle r="2.6" fill="#e9a91f" />
        </g>
      );
  }
}

interface KrathongSvgProps {
  design: KrathongDesign;
  className?: string;
  /** Flame flicker and glow; off for small thumbnails. */
  lit?: boolean;
  title?: string;
}

function KrathongSvgImpl({ design, className, lit = true, title }: KrathongSvgProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const base = BASE[design.base];
  const candle = design.candle ? CANDLE[design.candle] : null;
  const bead = design.beads ? BEAD[design.beads] : null;
  // slot i of the nine-slot ring takes the kind assigned to phase i % 3
  const phases = flowerPhases(design.flowers);
  const kindAt = (i: number): KrathongFlower | undefined => phases.find((p) => p.phase === i % 3)?.kind;
  const isLeaf = design.base === 'banana_leaf' || design.base === 'banana_rose';
  const thickness = design.base === 'banana_trunk' ? 13 : design.base === 'bread' ? 9 : 6;

  const outline72 = shapeOutline(design.shape, 72);
  const side = outline72.map((p) => project(p, 1.04, -thickness));
  const rim = outline72.map((p) => project(p, 1.04, 0));
  const top = outline72.map((p) => project(p, 0.94, 3));

  // Folded leaves or petals around the edge, two rows.
  const outerCount = design.shape === 'heart' ? 20 : 18;
  const outer = shapeOutline(design.shape, outerCount).map((p) => ({ p, back: p.y < 0.05 }));
  const innerRaw = shapeOutline(design.shape, outerCount * 2).filter((_, i) => i % 2 === 1);
  const inner = innerRaw.map((p) => ({ p, back: p.y < 0.05 }));

  const fold = (p: Pt, scale: number, height: number, key: string, row: 'outer' | 'inner') => {
    const b = project(p, scale * 0.82, 2);
    const tip = project(p, scale * 1.18, height);
    const angle = Math.atan2(p.y * SQUASH, p.x);
    const w = row === 'outer' ? 9 : 7.5;
    const nx = -Math.sin(angle) * w;
    const ny = Math.cos(angle) * w * SQUASH * 1.6;
    const l = { x: b.x + nx, y: b.y + ny };
    const r = { x: b.x - nx, y: b.y - ny };
    const fill = row === 'outer' ? base.rim : base.top;
    if (design.base === 'banana_leaf') {
      return (
        <g key={key}>
          <path d={`M${f(l.x)} ${f(l.y)} Q${f((l.x + tip.x) / 2)} ${f(tip.y + 2)} ${f(tip.x)} ${f(tip.y)} Q${f((r.x + tip.x) / 2)} ${f(tip.y + 2)} ${f(r.x)} ${f(r.y)} Z`} fill={fill} stroke={base.side} strokeWidth="0.7" />
          <path d={`M${f(b.x)} ${f(b.y)} L${f(tip.x)} ${f(tip.y + 1)}`} stroke={base.light} strokeOpacity="0.55" strokeWidth="0.8" />
        </g>
      );
    }
    if (design.base === 'banana_rose') {
      // Rolled "rose" fold: a rounded cup with a curl line.
      return (
        <g key={key}>
          <path d={`M${f(l.x)} ${f(l.y)} C${f(l.x)} ${f(tip.y - 4)} ${f(r.x)} ${f(tip.y - 4)} ${f(r.x)} ${f(r.y)} Z`} fill={fill} stroke={base.side} strokeWidth="0.7" />
          <path d={`M${f(l.x + (r.x - l.x) * 0.25)} ${f(tip.y + 4)} Q${f(tip.x)} ${f(tip.y - 1)} ${f(r.x - (r.x - l.x) * 0.25)} ${f(tip.y + 5)}`} fill="none" stroke={base.light} strokeOpacity="0.7" strokeWidth="0.9" />
        </g>
      );
    }
    if (design.base === 'flower') {
      return (
        <path key={key} d={`M${f(l.x)} ${f(l.y)} C${f(l.x - nx * 0.4)} ${f(tip.y)} ${f(r.x - nx * 0.4)} ${f(tip.y - 3)} ${f(r.x)} ${f(r.y)} Z`} fill={row === 'outer' ? '#e895b1' : '#f8d2de'} stroke={base.vein} strokeOpacity="0.5" strokeWidth="0.6" />
      );
    }
    return null;
  };

  const hasFolds = design.base === 'banana_leaf' || design.base === 'banana_rose' || design.base === 'flower';
  const outerFolds = (backHalf: boolean) =>
    hasFolds ? outer.filter((o) => o.back === backHalf).map((o, i) => fold(o.p, 1.02, 20, `o${backHalf}${i}`, 'outer')) : null;
  const innerFolds = (backHalf: boolean) =>
    hasFolds ? inner.filter((o) => o.back === backHalf).map((o, i) => fold(o.p, 0.78, 26, `i${backHalf}${i}`, 'inner')) : null;

  // Flowers sit in a ring on the plate.
  const ring = shapeOutline(design.shape, 9).map((p, i) => ({ ...project(p, 0.6, 12), back: p.y < 0, kind: kindAt(i) }));
  const flowerScale = 0.95;

  const beads = shapeOutline(design.shape, 26).map((p) => ({ ...project(p, 0.86, 6), back: p.y < 0 }));

  const candleTop = CY - 66;
  const candleBottom = CY - 10;

  const bread = design.base === 'bread';
  const trunk = design.base === 'banana_trunk';

  const centerCone: ReactNode = isLeaf ? (
    // A small leaf cone around the candle, like a simple baisri.
    <g>
      <path d={`M${CX - 17} ${CY - 6} Q${CX} ${CY - 2} ${CX + 17} ${CY - 6} L${CX + 7} ${CY - 36} L${CX - 7} ${CY - 36} Z`} fill={base.rim} stroke={base.side} strokeWidth="0.8" />
      <path d={`M${CX - 12} ${CY - 14} L${CX} ${CY - 34} L${CX + 12} ${CY - 14}`} fill="none" stroke={base.light} strokeOpacity="0.6" strokeWidth="0.9" />
      <path d={`M${CX - 9} ${CY - 24} L${CX} ${CY - 40} L${CX + 9} ${CY - 24}`} fill={base.top} stroke={base.side} strokeWidth="0.7" />
    </g>
  ) : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <radialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd88a" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#f5c76a" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#f5c76a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`flame${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff7a1a" />
          <stop offset="50%" stopColor="#ffc94d" />
          <stop offset="100%" stopColor="#fff8de" />
        </linearGradient>
        <radialGradient id={`plate${uid}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={base.light} />
          <stop offset="70%" stopColor={base.top} />
          <stop offset="100%" stopColor={base.rim} />
        </radialGradient>
        {candle && (
          <linearGradient id={`candle${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={candle.shade} />
            <stop offset="35%" stopColor={candle.body} />
            <stop offset="70%" stopColor={candle.body} />
            <stop offset="100%" stopColor={candle.shade} />
          </linearGradient>
        )}
      </defs>

      {/* glow and reflection on the water */}
      {lit && candle && <ellipse cx={CX} cy={CY + 34} rx="22" ry="34" fill={`url(#glow${uid})`} opacity="0.55" />}
      <ellipse cx={CX} cy={CY + 22} rx={R * 1.3} ry="10" fill="#000" opacity="0.22" />

      {/* plate body with thickness */}
      <path d={pathFrom(side)} fill={base.side} />
      <path d={`${pathFrom(rim)}`} fill={base.rim} />
      {trunk &&
        outline72
          .filter((_, i) => i % 6 === 0)
          .map((p, i) => {
            const a = project(p, 1.04, 0);
            return <line key={i} x1={a.x} y1={a.y} x2={a.x} y2={a.y + thickness} stroke={base.vein} strokeWidth="0.8" />;
          })}

      {outerFolds(true)}
      <path d={pathFrom(top)} fill={`url(#plate${uid})`} />
      {bread && (
        <g fill={base.vein} opacity="0.55">
          {shapeOutline(design.shape, 14).map((p, i) => {
            const a = project(p, 0.55 + (i % 3) * 0.12, 4);
            return <ellipse key={i} cx={a.x} cy={a.y} rx="2.2" ry="1" />;
          })}
        </g>
      )}
      {trunk && (
        <g fill="none" stroke={base.vein} strokeOpacity="0.6" strokeWidth="0.7">
          <ellipse cx={CX} cy={CY - 3} rx={R * 0.55} ry={R * 0.55 * SQUASH} />
          <ellipse cx={CX} cy={CY - 3} rx={R * 0.3} ry={R * 0.3 * SQUASH} />
        </g>
      )}
      {innerFolds(true)}

      {/* back decoration and flowers */}
      {bead &&
        beads.filter((b) => b.back).map((b, i) => <circle key={`bb${i}`} cx={b.x} cy={b.y} r="2.1" fill={bead} />)}
      {design.garland &&
        beads.filter((b) => b.back).map((b, i) => <circle key={`gb${i}`} cx={b.x} cy={b.y - 2} r="1.6" fill="#fffdf4" />)}
      {ring
        .filter((r) => r.back && r.kind)
        .map((r, i) => (
          <Flower key={`fb${i}`} kind={r.kind!} x={r.x} y={r.y} s={flowerScale * 0.85} />
        ))}

      {centerCone}

      {/* incense */}
      {design.incense && (
      <>
      <g stroke="#7a4a2c" strokeWidth="1.3" strokeLinecap="round">
        <line x1={CX + 13} y1={CY - 22} x2={CX + 19} y2={CY - 78} />
        <line x1={CX + 17} y1={CY - 20} x2={CX + 26} y2={CY - 74} />
        <line x1={CX + 21} y1={CY - 18} x2={CX + 33} y2={CY - 69} />
      </g>
      <g fill="#ff6a2b">
        <circle cx={CX + 19} cy={CY - 78} r="1.5" />
        <circle cx={CX + 26} cy={CY - 74} r="1.5" />
        <circle cx={CX + 33} cy={CY - 69} r="1.5" />
      </g>
      {lit && (
        <g className="lt-smoke" fill="none" stroke="#e8e4ff" strokeOpacity="0.25" strokeWidth="1.2" strokeLinecap="round">
          <path d={`M${CX + 19} ${CY - 80} q-4 -8 1 -14 q5 -6 0 -14`} />
          <path d={`M${CX + 33} ${CY - 71} q4 -8 -1 -14 q-5 -6 1 -13`} />
        </g>
      )}
      </>
      )}

      {/* candle */}
      {candle && (
      <>
      <rect x={CX - 6.5} y={candleTop} width="13" height={candleBottom - candleTop} rx="3" fill={`url(#candle${uid})`} />
      <path d={`M${CX - 6.5} ${candleTop + 3} q2 7 3 1 q1 9 3 2`} fill={candle.body} />
      <ellipse cx={CX} cy={candleTop} rx="6.5" ry="2.2" fill={candle.shade} />
      <line x1={CX} y1={candleTop} x2={CX} y2={candleTop - 4} stroke="#3a2a1e" strokeWidth="1.2" />
      {lit && <circle cx={CX} cy={candleTop - 12} r="26" fill={`url(#glow${uid})`} className="lt-glow" />}
      <path
        className={lit ? 'lt-flame' : undefined}
        d={`M${CX} ${candleTop - 23} C${CX + 6.5} ${candleTop - 13} ${CX + 5.5} ${candleTop - 4} ${CX} ${candleTop - 3} C${CX - 5.5} ${candleTop - 4} ${CX - 6.5} ${candleTop - 13} ${CX} ${candleTop - 23} Z`}
        fill={`url(#flame${uid})`}
      />
      <ellipse cx={CX} cy={candleTop - 8} rx="1.6" ry="3" fill="#fffbe9" opacity="0.9" />
      </>
      )}

      {design.coins && (
        <g>
          {[[-30, 16, '#d9a441'], [-16, 22, '#cfd3da'], [0, 24, '#d9a441'], [16, 22, '#cfd3da'], [29, 15, '#cfd3da']].map(
            ([dx, dy, c], i) => (
              <g key={`coin${i}`}>
                <ellipse cx={CX + (dx as number)} cy={CY + (dy as number) - 6} rx="5" ry="2.2" fill={c as string} />
                <ellipse cx={CX + (dx as number)} cy={CY + (dy as number) - 6.6} rx="3" ry="1.2" fill="#fff" opacity="0.35" />
              </g>
            ),
          )}
        </g>
      )}

      {/* garland or ribbon across the front */}
      {design.garland && (
        <g>
          {Array.from({ length: 15 }, (_, i) => {
            const u = i / 14;
            const x = CX - R * 0.9 + u * R * 1.8;
            const y = CY + 4 + Math.sin(u * Math.PI) * 15;
            return <circle key={i} cx={x} cy={y} r={i === 7 ? 3.6 : 2.4} fill={i === 7 ? '#c22042' : '#fffdf4'} stroke="#d9d2b8" strokeWidth="0.4" />;
          })}
          <path d={`M${CX - 2} ${CY + 21} l-3 9 M${CX + 2} ${CY + 21} l3 9`} stroke="#2f7a3f" strokeWidth="1.4" />
        </g>
      )}
      {bead && !design.garland && (
        <path
          d={`M${CX - R * 0.92} ${CY + 3} Q${CX - R * 0.45} ${CY + 22} ${CX} ${CY + 18} Q${CX + R * 0.45} ${CY + 22} ${CX + R * 0.92} ${CY + 3}`}
          fill="none"
          stroke={bead}
          strokeOpacity="0.85"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="0.5 4.5"
        />
      )}

      {/* front folds, flowers and decoration */}
      {innerFolds(false)}
      {ring
        .filter((r) => !r.back && r.kind)
        .map((r, i) => (
          <Flower key={`ff${i}`} kind={r.kind!} x={r.x} y={r.y} s={flowerScale} />
        ))}
      {bead &&
        beads.filter((b) => !b.back).map((b, i) => (
          <g key={`fbd${i}`}>
            <circle cx={b.x} cy={b.y} r="2.4" fill={bead} />
            <circle cx={b.x - 0.7} cy={b.y - 0.8} r="0.7" fill="#fff" opacity="0.7" />
          </g>
        ))}
      {design.garland &&
        beads.filter((b) => !b.back).map((b, i) => <circle key={`gf${i}`} cx={b.x} cy={b.y - 2} r="1.8" fill="#fffdf4" />)}
      {outerFolds(false)}
      {hasFolds &&
        outer
          .filter((o) => !o.back)
          .map((o, i) => {
            const tip = project(o.p, 1.02 * 1.18, 20);
            return <circle key={`tip${i}`} cx={tip.x} cy={tip.y} r="1.7" fill={bead ?? '#f5c76a'} />;
          })}
    </svg>
  );
}

export const KrathongSvg = memo(KrathongSvgImpl);
