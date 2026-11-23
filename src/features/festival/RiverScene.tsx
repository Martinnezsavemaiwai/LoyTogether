import { memo, useEffect, useMemo, useState } from 'react';
import type { RiverId } from '@/types/domain';
import { seededRandom } from './motion';
import { WaterLayer } from './WaterLayer';

/**
 * Full-bleed night scenes for each venue. The horizon sits at exactly 50% height
 * so the SVG can be cropped with `slice` on any screen and the krathong layer
 * still lines up with the water. Landmarks are kept near the centre (x 520-920)
 * so a phone in portrait still sees them.
 */

const W = 1440;
const H = 900;
const HZ = 450;

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

interface Theme {
  sky: [string, string, string];
  water: [string, string];
  glow: string;
  moon: { x: number; y: number; r: number };
  stars: number;
}

const THEMES: Record<RiverId, Theme> = {
  wat_arun: {
    sky: ['#070a1a', '#171b3f', '#4a3550'],
    water: ['#1c2a50', '#080c1e'],
    glow: '#ffb85c',
    moon: { x: 930, y: 120, r: 36 },
    stars: 70,
  },
  lumphini: {
    sky: ['#0a0c1f', '#1d2148', '#5a3f5c'],
    water: ['#1b2a4e', '#070b1c'],
    glow: '#ff9d6b',
    moon: { x: 600, y: 110, r: 34 },
    stars: 30,
  },
  sukhothai: {
    sky: ['#060917', '#141a3c', '#3d2c47'],
    water: ['#1a2a4d', '#070b1b'],
    glow: '#ffa64d',
    moon: { x: 880, y: 150, r: 44 },
    stars: 120,
  },
  chiang_mai: {
    sky: ['#060a19', '#13203f', '#35304f'],
    water: ['#172a4a', '#060b1a'],
    glow: '#ffb05a',
    moon: { x: 560, y: 130, r: 38 },
    stars: 110,
  },
  roi_et: {
    sky: ['#070a1b', '#151c44', '#3b3462'],
    water: ['#1b2c55', '#070b1e'],
    glow: '#ffcf7a',
    moon: { x: 590, y: 130, r: 40 },
    stars: 120,
  },
  sut: {
    sky: ['#050a18', '#10203d', '#2b3a5c'],
    water: ['#173250', '#06101e'],
    glow: '#9fd4ff',
    moon: { x: 640, y: 120, r: 42 },
    stars: 140,
  },
};

function useSeeded<T>(seed: number, make: (rand: () => number) => T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => make(seededRandom(seed)), [seed]);
}

function Stars({ seed, count }: { seed: number; count: number }) {
  const stars = useSeeded(seed, (rand) =>
    Array.from({ length: count }, () => ({
      x: rand() * W,
      y: rand() * (HZ - 120),
      r: 0.5 + rand() * 1.4,
      d: 2.5 + rand() * 4,
      delay: -rand() * 6,
    })),
  );
  return (
    <g fill="#fff9ec">
      {stars.map((s, i) => (
        <circle
          key={i}
          className="lt-star"
          cx={s.x}
          cy={s.y}
          r={s.r}
          style={{ '--d': `${s.d}s`, '--delay': `${s.delay}s` } as CSSVars}
        />
      ))}
    </g>
  );
}

/** Broken light streaks on the water below a light source. */
function Reflection({
  x,
  width,
  color,
  seed,
  rows = 18,
  start = HZ + 8,
}: {
  x: number;
  width: number;
  color: string;
  seed: number;
  rows?: number;
  start?: number;
}) {
  const id = `refl-${seed}`;
  const items = useSeeded(seed, (rand) =>
    Array.from({ length: rows }, (_, i) => {
      const spread = width * (0.6 + i * 0.08);
      return {
        y: start + i * i * 0.9 + i * 7,
        cx: x + (rand() - 0.5) * spread * 0.35,
        w: spread * (0.35 + rand() * 0.6),
        h: 2 + i * 0.35,
        d: 3.5 + rand() * 3,
        delay: -rand() * 5,
        o: Math.max(0.1, 0.8 - i * 0.04),
      };
    }),
  );
  return (
    <g fill={`url(#${id})`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="50%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {items.map((r, i) => (
        <rect
          key={i}
          className="lt-shimmer"
          x={r.cx - r.w / 2}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={r.h / 2}
          opacity={r.o}
          style={{ '--d': `${r.d}s`, '--delay': `${r.delay}s` } as CSSVars}
        />
      ))}
    </g>
  );
}

function Moon({ x, y, r, glow }: { x: number; y: number; r: number; glow: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r * 4.5} fill="url(#moonglow)" />
      <circle cx={x} cy={y} r={r * 1.6} fill={glow} opacity="0.06" />
      <circle cx={x} cy={y} r={r} fill="url(#moonface)" />
      <circle cx={x - r * 0.3} cy={y + r * 0.15} r={r * 0.17} fill="#e2cf9f" opacity="0.5" />
      <circle cx={x + r * 0.3} cy={y - r * 0.28} r={r * 0.1} fill="#e2cf9f" opacity="0.45" />
      <circle cx={x + r * 0.1} cy={y + r * 0.45} r={r * 0.08} fill="#e2cf9f" opacity="0.4" />
    </g>
  );
}

function Treeline({
  seed,
  color,
  y = HZ,
  from = 0,
  to = W,
  height = 40,
}: {
  seed: number;
  color: string;
  y?: number;
  from?: number;
  to?: number;
  height?: number;
}) {
  const d = useSeeded(seed, (rand) => {
    let path = `M${from} ${y}`;
    for (let x = from; x <= to; x += 18 + rand() * 16) {
      const h = height * (0.5 + rand() * 0.7);
      path += ` Q${x + 8} ${y - h - 10} ${x + 18} ${y - h * 0.7}`;
    }
    return `${path} L${to} ${y} Z`;
  });
  return <path d={d} fill={color} />;
}

function Windows({
  seed,
  x,
  y,
  w,
  h,
  density = 0.45,
  color = '#ffd99a',
}: {
  seed: number;
  x: number;
  y: number;
  w: number;
  h: number;
  density?: number;
  color?: string;
}) {
  const lights = useSeeded(seed, (rand) => {
    const out: { x: number; y: number; o: number }[] = [];
    for (let yy = y + 6; yy < y + h - 4; yy += 9) {
      for (let xx = x + 4; xx < x + w - 4; xx += 7) {
        if (rand() < density) out.push({ x: xx, y: yy, o: 0.45 + rand() * 0.55 });
      }
    }
    return out;
  });
  return (
    <g fill={color}>
      {lights.map((l, i) => (
        <rect key={i} x={l.x} y={l.y} width="3" height="4" opacity={l.o} />
      ))}
    </g>
  );
}

/* ---------------- Wat Arun ---------------- */

function Prang({ cx, base, s, lit }: { cx: number; base: number; s: number; lit: string }) {
  const tiers = Array.from({ length: 7 }, (_, i) => {
    const w = (70 - i * 8.5) * s;
    const y = base - (46 + i * 30) * s;
    return `M${cx - w / 2} ${y + 30 * s} Q${cx - w / 2 - 5 * s} ${y + 13 * s} ${cx - w / 2 + 4 * s} ${y} L${cx + w / 2 - 4 * s} ${y} Q${cx + w / 2 + 5 * s} ${y + 13 * s} ${cx + w / 2} ${y + 30 * s} Z`;
  });
  return (
    <g>
      <path
        d={`M${cx - 70 * s} ${base} L${cx - 56 * s} ${base - 46 * s} L${cx + 56 * s} ${base - 46 * s} L${cx + 70 * s} ${base} Z`}
        fill={lit}
      />
      {tiers.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={lit}
          stroke="#8a5a2a"
          strokeOpacity="0.35"
          strokeWidth={1.2 * s}
        />
      ))}
      <path
        d={`M${cx - 5 * s} ${base - 256 * s} L${cx} ${base - 330 * s} L${cx + 5 * s} ${base - 256 * s} Z`}
        fill={lit}
      />
      {/* band of lighter ornament on each tier */}
      {Array.from({ length: 7 }, (_, i) => (
        <rect
          key={i}
          x={cx - (30 - i * 3.5) * s}
          y={base - (46 + i * 30) * s + 12 * s}
          width={(60 - i * 7) * s}
          height={3 * s}
          fill="#fff4d6"
          opacity="0.55"
        />
      ))}
    </g>
  );
}

function WatArun() {
  const lit = 'url(#prangLit)';
  return (
    <g>
      <defs>
        <linearGradient id="prangLit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1cc" />
          <stop offset="60%" stopColor="#f2c77e" />
          <stop offset="100%" stopColor="#c98f45" />
        </linearGradient>
      </defs>
      <rect x="0" y={HZ - 22} width={W} height="22" fill="#0b0e20" />
      <Treeline seed={11} color="#0b0e20" y={HZ - 18} height={36} />
      <Prang cx={520} base={HZ - 16} s={0.5} lit={lit} />
      <Prang cx={920} base={HZ - 16} s={0.5} lit={lit} />
      <Prang cx={600} base={HZ - 16} s={0.6} lit={lit} />
      <Prang cx={840} base={HZ - 16} s={0.6} lit={lit} />
      <Prang cx={720} base={HZ - 16} s={1.08} lit={lit} />
      <rect x="430" y={HZ - 18} width="580" height="6" fill="#ffd89a" opacity="0.6" />
      <Reflection x={720} width={200} color="#ffd38a" seed={101} rows={20} />
      <Reflection x={530} width={70} color="#ffcf80" seed={102} rows={12} />
      <Reflection x={910} width={70} color="#ffcf80" seed={103} rows={12} />
    </g>
  );
}

/* ---------------- Lumphini ---------------- */

function Lumphini() {
  const towers = [
    { x: 380, w: 70, h: 190 },
    { x: 455, w: 46, h: 260 },
    { x: 505, w: 80, h: 160 },
    { x: 590, w: 54, h: 300 },
    { x: 650, w: 90, h: 210 },
    { x: 745, w: 40, h: 340 },
    { x: 790, w: 76, h: 230 },
    { x: 870, w: 58, h: 280 },
    { x: 932, w: 88, h: 180 },
    { x: 1025, w: 60, h: 240 },
    { x: 220, w: 90, h: 140 },
    { x: 1090, w: 100, h: 150 },
    { x: 1200, w: 70, h: 200 },
    { x: 120, w: 70, h: 170 },
  ];
  return (
    <g>
      <rect y={HZ - 360} width={W} height="360" fill="url(#cityglow)" />
      {towers.map((t, i) => (
        <g key={i}>
          <rect
            x={t.x}
            y={HZ - 30 - t.h}
            width={t.w}
            height={t.h}
            fill={i % 2 ? '#141836' : '#101430'}
          />
          <Windows seed={200 + i} x={t.x} y={HZ - 30 - t.h} w={t.w} h={t.h - 10} density={0.35} />
          {t.h > 270 && (
            <circle
              cx={t.x + t.w / 2}
              cy={HZ - 34 - t.h}
              r="2.5"
              fill="#ff5a5a"
              className="lt-star"
              style={{ '--d': '2s' } as CSSVars}
            />
          )}
        </g>
      ))}
      <Treeline seed={21} color="#0a0f1c" y={HZ} height={46} />
      <Treeline seed={22} color="#0d1424" y={HZ + 2} height={26} />
      {/* string of lanterns along the shore */}
      {Array.from({ length: 22 }, (_, i) => {
        const x = 300 + i * 40;
        return (
          <circle
            key={i}
            cx={x}
            cy={HZ - 26 + Math.sin(i * 0.9) * 3}
            r="3"
            fill={['#ffcf6a', '#ff8a9e', '#9fd4ff'][i % 3]}
          />
        );
      })}
      <Reflection x={760} width={420} color="#ffcf8a" seed={203} rows={18} />
      <Reflection x={600} width={60} color="#ff9ad0" seed={204} rows={10} />
    </g>
  );
}

/* ---------------- Sukhothai ---------------- */

function LotusBudChedi({ cx, base, s }: { cx: number; base: number; s: number }) {
  return (
    <g fill="url(#ruinLit)">
      <rect x={cx - 70 * s} y={base - 30 * s} width={140 * s} height={30 * s} />
      <rect x={cx - 54 * s} y={base - 60 * s} width={108 * s} height={30 * s} />
      <rect x={cx - 40 * s} y={base - 100 * s} width={80 * s} height={40 * s} />
      <rect x={cx - 26 * s} y={base - 130 * s} width={52 * s} height={30 * s} />
      {/* the lotus bud */}
      <path
        d={`M${cx - 30 * s} ${base - 130 * s} C${cx - 34 * s} ${base - 175 * s} ${cx - 10 * s} ${base - 200 * s} ${cx} ${base - 222 * s} C${cx + 10 * s} ${base - 200 * s} ${cx + 34 * s} ${base - 175 * s} ${cx + 30 * s} ${base - 130 * s} Z`}
      />
      <rect x={cx - 2.5 * s} y={base - 262 * s} width={5 * s} height={42 * s} />
    </g>
  );
}

function SugarPalm({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g fill="#090c1a" stroke="#090c1a">
      <path
        d={`M${x} ${y} Q${x + 4 * s} ${y - 90 * s} ${x + 2 * s} ${y - 170 * s}`}
        strokeWidth={4 * s}
        fill="none"
      />
      {Array.from({ length: 9 }, (_, i) => {
        const a = -Math.PI + (i / 8) * Math.PI;
        const ex = x + 2 * s + Math.cos(a) * 40 * s;
        const ey = y - 170 * s + Math.sin(a) * 26 * s;
        return (
          <path
            key={i}
            d={`M${x + 2 * s} ${y - 170 * s} L${ex - 6 * s} ${ey} L${ex + 6 * s} ${ey} Z`}
            stroke="none"
          />
        );
      })}
    </g>
  );
}

function Fireworks({
  seed,
  count,
  region,
}: {
  seed: number;
  count: number;
  region: [number, number, number, number];
}) {
  const bursts = useSeeded(seed, (rand) =>
    Array.from({ length: count }, () => ({
      x: region[0] + rand() * (region[2] - region[0]),
      y: region[1] + rand() * (region[3] - region[1]),
      r: 30 + rand() * 40,
      color: ['#ffd27a', '#ff8fb1', '#a9e1ff', '#c6a8ff'][Math.floor(rand() * 4)] as string,
      d: 4 + rand() * 4,
      delay: -rand() * 8,
    })),
  );
  return (
    <g>
      {bursts.map((b, i) => (
        <g
          key={i}
          className="lt-firework"
          style={
            {
              '--d': `${b.d}s`,
              '--delay': `${b.delay}s`,
              transformOrigin: `${b.x}px ${b.y}px`,
            } as CSSVars
          }
        >
          {Array.from({ length: 14 }, (_, k) => {
            const a = (k / 14) * Math.PI * 2;
            return (
              <line
                key={k}
                x1={b.x + Math.cos(a) * b.r * 0.35}
                y1={b.y + Math.sin(a) * b.r * 0.35}
                x2={b.x + Math.cos(a) * b.r}
                y2={b.y + Math.sin(a) * b.r}
                stroke={b.color}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            );
          })}
        </g>
      ))}
    </g>
  );
}

function Sukhothai() {
  return (
    <g>
      <defs>
        <linearGradient id="ruinLit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6c88a" />
          <stop offset="100%" stopColor="#a8683a" />
        </linearGradient>
      </defs>
      <rect x="0" y={HZ - 18} width={W} height="18" fill="#0a0d1d" />
      <Treeline seed={32} color="#0a0d1d" y={HZ - 14} height={30} />
      {/* ruined vihara pillars */}
      {[500, 530, 560, 590, 850, 880, 910, 940].map((x) => (
        <rect
          key={x}
          x={x}
          y={HZ - 110}
          width="13"
          height="96"
          fill="url(#ruinLit)"
          opacity="0.9"
        />
      ))}
      <LotusBudChedi cx={720} base={HZ - 14} s={1} />
      <LotusBudChedi cx={420} base={HZ - 14} s={0.45} />
      <LotusBudChedi cx={1030} base={HZ - 14} s={0.5} />
      <SugarPalm x={300} y={HZ - 10} s={1} />
      <SugarPalm x={1140} y={HZ - 10} s={1.1} />
      <SugarPalm x={1210} y={HZ - 10} s={0.8} />
      {/* candle lights along the terrace */}
      {Array.from({ length: 36 }, (_, i) => (
        <circle key={i} cx={420 + i * 17} cy={HZ - 15} r="2" fill="#ffd27a" />
      ))}
      <Reflection x={720} width={150} color="#ffc277" seed={301} rows={18} />
    </g>
  );
}

/* ---------------- Chiang Mai ---------------- */

function LannaRoof({ cx, base, s }: { cx: number; base: number; s: number }) {
  return (
    <g fill="#0b0f22">
      <rect x={cx - 80 * s} y={base - 40 * s} width={160 * s} height={40 * s} />
      <path
        d={`M${cx - 110 * s} ${base - 36 * s} L${cx} ${base - 110 * s} L${cx + 110 * s} ${base - 36 * s} Z`}
      />
      <path
        d={`M${cx - 70 * s} ${base - 76 * s} L${cx} ${base - 150 * s} L${cx + 70 * s} ${base - 76 * s} Z`}
      />
      <path d={`M${cx - 4 * s} ${base - 150 * s} q12 -16 22 -16 q-10 6 -14 22 Z`} />
    </g>
  );
}

function SkyLanterns({ seed, count }: { seed: number; count: number }) {
  const lanterns = useSeeded(seed, (rand) =>
    Array.from({ length: count }, () => ({
      x: 300 + rand() * 840,
      s: 0.5 + rand() * 0.9,
      d: 18 + rand() * 22,
      delay: -rand() * 40,
      drift: (rand() - 0.5) * 120,
    })),
  );
  return (
    <g>
      {lanterns.map((l, i) => (
        <g
          key={i}
          className="lt-khomloi"
          style={
            { '--d': `${l.d}s`, '--delay': `${l.delay}s`, '--drift': `${l.drift}px` } as CSSVars
          }
        >
          <g transform={`translate(${l.x} ${HZ - 30}) scale(${l.s})`}>
            <circle r="16" fill="#ffb347" opacity="0.18" />
            <path d="M-7 -10 L7 -10 L5 8 L-5 8 Z" fill="#ffcf73" />
            <path d="M-5 8 L5 8 L3 11 L-3 11 Z" fill="#ff8a2a" />
          </g>
        </g>
      ))}
    </g>
  );
}

function ChiangMai() {
  return (
    <g>
      {/* Doi Suthep */}
      <path
        d={`M0 ${HZ - 30} Q220 ${HZ - 260} 520 ${HZ - 190} Q700 ${HZ - 150} 900 ${HZ - 240} Q1180 ${HZ - 330} 1440 ${HZ - 120} L1440 ${HZ} L0 ${HZ} Z`}
        fill="#121a36"
      />
      <circle cx="960" cy={HZ - 238} r="3" fill="#ffd27a" />
      <rect x="0" y={HZ - 20} width={W} height="20" fill="#0a0e1f" />
      <Treeline seed={42} color="#0a0e1f" y={HZ - 16} height={28} />
      <LannaRoof cx={560} base={HZ - 16} s={0.8} />
      <LannaRoof cx={880} base={HZ - 16} s={0.65} />
      {/* yi peng lantern strings */}
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <path
            d={`M300 ${HZ - 70 + row * 18} Q720 ${HZ - 30 + row * 18} 1140 ${HZ - 70 + row * 18}`}
            fill="none"
            stroke="#3a2d2a"
            strokeWidth="1"
          />
          {Array.from({ length: 24 }, (_, i) => {
            const u = i / 23;
            const x = 300 + u * 840;
            const y = HZ - 70 + row * 18 + Math.sin(u * Math.PI) * 40;
            const color = ['#ffcc5c', '#ff6b6b', '#ffd9a0', '#f58aa8'][(i + row) % 4];
            return (
              <g key={i}>
                <circle cx={x} cy={y + 6} r="9" fill={color} opacity="0.18" />
                <ellipse cx={x} cy={y + 6} rx="4" ry="5.5" fill={color} />
              </g>
            );
          })}
        </g>
      ))}
      <Reflection x={720} width={420} color="#ffc979" seed={401} rows={18} />
    </g>
  );
}

/* ---------------- Roi Et ---------------- */

function HoWot({ cx, base }: { cx: number; base: number }) {
  // A slender tower with a flared crown of pipes, after the Ho Wot tower by the lake.
  return (
    <g>
      <path
        d={`M${cx - 26} ${base} L${cx - 9} ${base - 250} L${cx + 9} ${base - 250} L${cx + 26} ${base} Z`}
        fill="url(#towerLit)"
      />
      <g fill="url(#towerLit)">
        {Array.from({ length: 11 }, (_, i) => {
          const a = -0.9 + (i / 10) * 1.8;
          return (
            <rect
              key={i}
              x={cx - 4}
              y={base - 330}
              width="8"
              height="80"
              rx="3"
              transform={`rotate(${a * 16} ${cx} ${base - 250})`}
            />
          );
        })}
      </g>
      <ellipse cx={cx} cy={base - 252} rx="30" ry="7" fill="#fff0c8" />
      <rect x={cx - 1.5} y={base - 372} width="3" height="44" fill="#fff0c8" />
      <circle cx={cx} cy={base - 374} r="4" fill="#ffe08a" className="lt-glow" />
    </g>
  );
}

function RoiEt() {
  return (
    <g>
      <defs>
        <linearGradient id="towerLit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d9a25a" />
          <stop offset="50%" stopColor="#ffe3a8" />
          <stop offset="100%" stopColor="#c08643" />
        </linearGradient>
      </defs>
      <rect x="0" y={HZ - 16} width={W} height="16" fill="#0a0d20" />
      <Treeline seed={52} color="#0a0d20" y={HZ - 12} height={44} />
      {/* island with a sala */}
      <path
        d={`M380 ${HZ} Q420 ${HZ - 40} 480 ${HZ - 44} L500 ${HZ - 44} Q560 ${HZ - 40} 600 ${HZ} Z`}
        fill="#0b0f22"
      />
      <HoWot cx={770} base={HZ - 12} />
      {/* oil lamps along the shore */}
      {Array.from({ length: 44 }, (_, i) => (
        <g key={i}>
          <circle cx={250 + i * 22} cy={HZ - 10} r="6" fill="#ffcf73" opacity="0.15" />
          <circle cx={250 + i * 22} cy={HZ - 10} r="1.8" fill="#ffdf96" />
        </g>
      ))}
      <Reflection x={770} width={110} color="#ffd890" seed={501} rows={20} />
      <Reflection x={560} width={260} color="#ffcf80" seed={502} rows={10} start={HZ + 20} />
    </g>
  );
}

/* ---------------- SUT ---------------- */

function Sut() {
  const blocks = [
    { x: 470, w: 130, h: 70 },
    { x: 600, w: 70, h: 110 },
    { x: 690, w: 150, h: 84 },
    { x: 860, w: 90, h: 60 },
    { x: 960, w: 120, h: 76 },
  ];
  return (
    <g>
      {/* Korat plateau hills */}
      <path
        d={`M0 ${HZ - 60} Q300 ${HZ - 150} 620 ${HZ - 90} Q900 ${HZ - 40} 1180 ${HZ - 120} Q1320 ${HZ - 150} 1440 ${HZ - 90} L1440 ${HZ} L0 ${HZ} Z`}
        fill="#0f1a32"
      />
      <Treeline seed={61} color="#0b1428" y={HZ - 10} height={40} />
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={HZ - 14 - b.h} width={b.w} height={b.h} fill="#0e1630" />
          <Windows
            seed={600 + i}
            x={b.x}
            y={HZ - 14 - b.h}
            w={b.w}
            h={b.h}
            density={0.3}
            color="#cfe6ff"
          />
        </g>
      ))}
      {/* waterside sala with string lights */}
      <path
        d={`M300 ${HZ - 10} L330 ${HZ - 52} L410 ${HZ - 52} L440 ${HZ - 10} Z`}
        fill="#0b1226"
      />
      <path
        d={`M440 ${HZ - 40} Q720 ${HZ - 4} 1080 ${HZ - 40}`}
        fill="none"
        stroke="#2a3350"
        strokeWidth="1"
      />
      {Array.from({ length: 30 }, (_, i) => {
        const u = i / 29;
        return (
          <circle
            key={i}
            cx={440 + u * 640}
            cy={HZ - 40 + Math.sin(u * Math.PI) * 30}
            r="2.4"
            fill={i % 2 ? '#ffe6a8' : '#bfe0ff'}
          />
        );
      })}
      <rect y={HZ - 30} width={W} height="60" fill="url(#mist)" />
      <Reflection x={640} width={120} color="#e8f2ff" seed={601} rows={18} />
      <Reflection x={760} width={360} color="#ffe2a8" seed={602} rows={8} start={HZ + 14} />
    </g>
  );
}

/**
 * The Chao Phraya dinner cruise, rendered alone from the scene camera
 * (blender/venues.py --sprite cruise) and cropped. It crosses the river left to right
 * with a faded mirror image under it for the reflection.
 */
const CRUISE = { x: 523.5, y: 373.5, w: 392.3, h: 111.7, waterline: 480 };

function Boat() {
  const { x, y, w, h, waterline } = CRUISE;
  return (
    <g transform={`translate(${-(x + w) - 20} 0)`}>
      <defs>
        <linearGradient id="cruiseFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="cruiseMask" maskContentUnits="userSpaceOnUse">
          <rect x={x} y={waterline} width={w} height={h} fill="url(#cruiseFade)" />
        </mask>
      </defs>
      <g className="lt-cruise" style={{ '--d': '95s' } as CSSVars}>
        <g mask="url(#cruiseMask)">
          <image
            href="/scenes/wat_arun-cruise.webp"
            x={x}
            y={y}
            width={w}
            height={h}
            transform={`translate(0 ${waterline * 2}) scale(1 -1)`}
          />
        </g>
        <image href="/scenes/wat_arun-cruise.webp" x={x} y={y} width={w} height={h} />
      </g>
    </g>
  );
}

/** Moving parts drawn over the rendered backdrop. */
const FX: Partial<Record<RiverId, () => React.ReactElement>> = {
  wat_arun: Boat,
  sukhothai: () => <Fireworks seed={31} count={5} region={[380, 40, 1060, 220]} />,
  chiang_mai: () => <SkyLanterns seed={41} count={22} />,
  roi_et: () => <Fireworks seed={51} count={3} region={[860, 60, 1100, 200]} />,
};

const LANDMARK: Record<RiverId, () => React.ReactElement> = {
  wat_arun: WatArun,
  lumphini: Lumphini,
  sukhothai: Sukhothai,
  chiang_mai: ChiangMai,
  roi_et: RoiEt,
  sut: Sut,
};

/** Blender renders in public/scenes (see blender/venues.py). The SVG scene shows until it loads. */
/** Venues where only part of the lower half is water: a mask rendered with blender/venues.py --mask. */
const WATER_MASKS: Partial<Record<RiverId, string>> = {
  sut: '/scenes/sut-mask.png',
};

function backdropUrl(river: RiverId, size: 'sm' | 'lg' | 'auto') {
  const small =
    size === 'sm' ||
    (size === 'auto' &&
      typeof window !== 'undefined' &&
      window.innerWidth * (window.devicePixelRatio || 1) < 1100);
  return `/scenes/${river}${small ? '-sm' : ''}.webp`;
}

function RiverSceneImpl({
  river,
  className,
  size = 'auto',
  water = false,
}: {
  river: RiverId;
  className?: string;
  size?: 'sm' | 'lg' | 'auto';
  /** Moving WebGL water over the backdrop. Off for small thumbnails. */
  water?: false | 'full' | 'lite';
}) {
  const t = THEMES[river];
  const Landmark = LANDMARK[river];
  const Fx = FX[river];
  const href = useMemo(() => backdropUrl(river, size), [river, size]);
  const [loaded, setLoaded] = useState<string | null>(null);
  // React does not fire onLoad for an SVG <image>, so watch the file through an Image.
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) setLoaded(href);
    };
    img.src = href;
    return () => {
      alive = false;
    };
  }, [href]);
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`sky-${river}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.sky[0]} />
            <stop offset="60%" stopColor={t.sky[1]} />
            <stop offset="100%" stopColor={t.sky[2]} />
          </linearGradient>
          <linearGradient id={`water-${river}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.water[0]} />
            <stop offset="100%" stopColor={t.water[1]} />
          </linearGradient>
          <radialGradient id="moonglow">
            <stop offset="0%" stopColor="#fff3d1" stopOpacity="0.45" />
            <stop offset="40%" stopColor="#fff3d1" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#fff3d1" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="moonface" cx="40%" cy="38%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="70%" stopColor="#f7ecd0" />
            <stop offset="100%" stopColor="#e6d3a8" />
          </radialGradient>
          <linearGradient id={`horizon-${river}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.glow} stopOpacity="0" />
            <stop offset="100%" stopColor={t.glow} stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="cityglow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff9d6b" stopOpacity="0" />
            <stop offset="100%" stopColor="#ff9d6b" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cfe6ff" stopOpacity="0" />
            <stop offset="50%" stopColor="#cfe6ff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#cfe6ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`waterHaze-${river}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.glow} stopOpacity="0.14" />
            <stop offset="100%" stopColor={t.glow} stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width={W} height={HZ} fill={`url(#sky-${river})`} />
        <rect y={HZ - 200} width={W} height="200" fill={`url(#horizon-${river})`} />
        <Stars seed={river.length * 97 + t.stars} count={t.stars} />
        <Moon x={t.moon.x} y={t.moon.y} r={t.moon.r} glow={t.glow} />

        <rect y={HZ} width={W} height={H - HZ} fill={`url(#water-${river})`} />
        <rect y={HZ} width={W} height="140" fill={`url(#waterHaze-${river})`} />
        <Reflection x={t.moon.x} width={70} color="#fff3d6" seed={t.moon.x} rows={14} />

        <Landmark />

        <image
          href={href}
          x="0"
          y="0"
          width={W}
          height={H}
          preserveAspectRatio="xMidYMid slice"
          style={{ opacity: loaded === href ? 1 : 0, transition: 'opacity 900ms ease-out' }}
        />

        {!water && Fx && <Fx />}

        {!water && (
          <g className="lt-swell" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="2" fill="none">
            {[520, 600, 690, 790].map((y) => (
              <path key={y} d={`M-60 ${y} Q360 ${y - 10} 720 ${y} T1500 ${y}`} />
            ))}
          </g>
        )}
      </svg>
      {water && (
        <WaterLayer
          src={href}
          glow={t.glow}
          moonX={t.moon.x}
          quality={water}
          maskSrc={WATER_MASKS[river]}
          className={className}
        />
      )}
      {water && Fx && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          className={className}
          aria-hidden="true"
        >
          <Fx />
        </svg>
      )}
    </>
  );
}

export const RiverScene = memo(RiverSceneImpl);
