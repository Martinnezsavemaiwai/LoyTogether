import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { liftPercent, spriteLayers } from '@/features/krathong/KrathongArt';
import { BASES, BEADS, CANDLES, DEFAULT_DESIGN, FLOWERS, SHAPES } from '@/features/krathong/options';
import { COIN_SLOTS, COIN_VALUES, NOTE_SLOTS, NOTE_VALUES } from '@/features/krathong/money';
import { RIVERS } from '@/features/rivers/rivers';
import type { KrathongDesign } from '@/types/domain';

const full = (patch: Partial<KrathongDesign>): KrathongDesign => ({ ...DEFAULT_DESIGN, ...patch });

describe('rendered krathong sprites', () => {
  it('has a sprite for every part on every shape', () => {
    const missing = new Set<string>();
    const check = (d: KrathongDesign) => {
      for (const layer of spriteLayers(d)) if (!existsSync(`public${layer.src}`)) missing.add(layer.src);
    };
    for (const { value: shape } of SHAPES) {
      for (const { value: base } of BASES) check(full({ shape, base }));
      for (const { value: kind } of FLOWERS) check(full({ shape, flowers: [kind] }));
      for (const { value: candle } of CANDLES) check(full({ shape, candle }));
      for (const { value: beads } of BEADS) check(full({ shape, beads }));
      check(full({ shape, garland: true, coins: true, incense: true }));
    }
    expect([...missing]).toEqual([]);
  });

  it('has a money sprite for every note and coin in every slot', () => {
    const missing = [
      ...NOTE_VALUES.flatMap((v) => Array.from({ length: NOTE_SLOTS }, (_, s) => `/krathong/note-${v}-s${s}.webp`)),
      ...COIN_VALUES.flatMap((v) => Array.from({ length: COIN_SLOTS }, (_, s) => `/krathong/coin-${v}-s${s}.webp`)),
    ].filter((src) => !existsSync(`public${src}`));
    expect(missing).toEqual([]);
    expect(spriteLayers(full({ money: 1888 })).filter((l) => /^(note|coin)-/.test(l.key))).toHaveLength(8);
  });

  it('stacks layers back to front and skips parts that are left out', () => {
    const keys = spriteLayers(
      full({ flowers: ['rose'], candle: 'red', beads: 'pearl', garland: true, coins: true }),
    ).map((l) => l.key.replace(/-(\w+)-\d$/, ''));
    expect(keys[0]).toBe('base');
    expect(keys.indexOf('candle')).toBeGreaterThan(keys.indexOf('flower-back'));
    expect(keys.indexOf('flower-front')).toBeGreaterThan(keys.indexOf('candle'));
    expect(keys.indexOf('rim-front')).toBeGreaterThan(keys.indexOf('flower-front'));
    expect(keys.at(-1)).toBe('garland-front');

    const bare = spriteLayers(full({ flowers: [], candle: null, incense: false, beads: null, garland: false }));
    expect(bare.map((l) => l.key)).toEqual(['base', 'rim-front']);

    const trunk = spriteLayers(full({ base: 'banana_trunk', flowers: [], candle: null, incense: false, beads: null }));
    expect(trunk.map((l) => l.key)).toEqual(['base']);
  });

  it('gives every ring slot a flower when one to three kinds are picked', () => {
    for (const flowers of [['rose'], ['rose', 'lotus'], ['rose', 'lotus', 'jasmine']] as const) {
      const back = spriteLayers(full({ flowers: [...flowers] })).filter((l) => l.key.startsWith('flower-back'));
      expect(back).toHaveLength(3);
    }
  });

  it('raises parts on tall bases and keeps thin ones near zero', () => {
    expect(liftPercent('banana_trunk')).toBeGreaterThan(5);
    expect(Math.abs(liftPercent('banana_leaf'))).toBeLessThan(1);
  });
});

describe('rendered venue backdrops', () => {
  it('has a large and a small backdrop for every venue', () => {
    for (const river of RIVERS) {
      expect(existsSync(`public/scenes/${river.id}.webp`), river.id).toBe(true);
      expect(existsSync(`public/scenes/${river.id}-sm.webp`), river.id).toBe(true);
    }
  });
});
