import { describe, expect, it } from 'vitest';
import { BLANK_DESIGN, DEFAULT_DESIGN, flowerPhases, isValidDesign, normalizeDesign, randomDesign } from '@/features/krathong/options';
import { breakdownMoney, describeMoney, moneyLayers } from '@/features/krathong/money';
import { RIVERS, getRiver, riverByRoomId } from '@/features/rivers/rivers';
import {
  crossingProgress,
  driftDelaySeconds,
  floatParams,
  hashString,
} from '@/features/festival/motion';
import { mergeKrathongs } from '@/hooks/useRoom';
import { mapKrathongRow, type KrathongRow } from '@/lib/backend/mapRow';
import { containsBlockedWords } from '@/lib/moderation';
import {
  charLength,
  generateDisplayName,
  validateDisplayName,
  validateWish,
} from '@/lib/validation';
import type { Krathong } from '@/types/domain';

describe('river configuration', () => {
  it('has six venues with unique ids and room ids', () => {
    expect(RIVERS).toHaveLength(6);
    expect(new Set(RIVERS.map((r) => r.id)).size).toBe(6);
    expect(new Set(RIVERS.map((r) => r.publicRoomId)).size).toBe(6);
  });

  it('looks rivers up by id and room id', () => {
    expect(getRiver('wat_arun')?.region).toBe('กรุงเทพฯ');
    expect(getRiver('nile')).toBeUndefined();
    expect(riverByRoomId('00000000-0000-4000-8000-000000000006')?.id).toBe('sut');
  });
});

describe('krathong customization', () => {
  it('accepts the default design', () => {
    expect(isValidDesign(DEFAULT_DESIGN)).toBe(true);
  });

  it('rejects unknown values, extra keys and too many flowers', () => {
    expect(isValidDesign({ ...DEFAULT_DESIGN, candle: 'neon' })).toBe(false);
    expect(isValidDesign({ ...DEFAULT_DESIGN, extra: 'x' })).toBe(false);
    expect(isValidDesign({ ...DEFAULT_DESIGN, flowers: ['rose', 'rose'] })).toBe(false);
    expect(isValidDesign({ ...DEFAULT_DESIGN, flowers: ['rose', 'lotus', 'orchid', 'jasmine'] })).toBe(false);
    expect(isValidDesign(null)).toBe(false);
    expect(isValidDesign([])).toBe(false);
  });

  it('accepts a krathong with nothing on the plate', () => {
    expect(
      isValidDesign({ ...DEFAULT_DESIGN, flowers: [], candle: null, incense: false, beads: null, garland: false }),
    ).toBe(true);
  });

  it('normalizes broken designs field by field', () => {
    expect(normalizeDesign({ shape: 'heart', candle: 'neon' })).toEqual({ ...DEFAULT_DESIGN, shape: 'heart' });
  });

  it('reads the older single-choice design', () => {
    expect(
      normalizeDesign({ shape: 'circle', base: 'flower', flower: 'rose', candle: 'red', decoration: 'jasmine_garland' }),
    ).toEqual({ ...DEFAULT_DESIGN, shape: 'circle', base: 'flower', flowers: ['rose'], candle: 'red', beads: null, garland: true });
  });

  it('splits ring slots between up to three flower kinds', () => {
    expect(flowerPhases([])).toEqual([]);
    expect(flowerPhases(['rose']).map((p) => p.phase)).toEqual([0, 1, 2]);
    expect(flowerPhases(['rose', 'lotus']).map((p) => p.kind)).toEqual(['rose', 'lotus', 'rose']);
    expect(flowerPhases(['rose', 'lotus', 'jasmine']).map((p) => p.kind)).toEqual(['rose', 'lotus', 'jasmine']);
  });
});

describe('text validation', () => {
  it('requires a display name and limits it to 24 characters', () => {
    expect(validateDisplayName('   ').ok).toBe(false);
    expect(validateDisplayName('ก'.repeat(25)).ok).toBe(false);
    expect(validateDisplayName('  บัว   ทอง ')).toEqual({ ok: true, value: 'บัว ทอง' });
  });

  it('strips invisible and bidi characters from names', () => {
    expect(validateDisplayName('บัว​‮ทอง')).toEqual({ ok: true, value: 'บัวทอง' });
  });

  it('allows an empty wish and caps it at 280 characters', () => {
    expect(validateWish('')).toEqual({ ok: true, value: '' });
    expect(validateWish('ข'.repeat(280)).ok).toBe(true);
    expect(validateWish('ข'.repeat(281)).ok).toBe(false);
  });

  it('keeps line breaks in wishes', () => {
    expect(validateWish('บรรทัดแรก\nบรรทัดสอง')).toEqual({ ok: true, value: 'บรรทัดแรก\nบรรทัดสอง' });
  });

  it('counts code points like Postgres', () => {
    expect(charLength('น้ำ')).toBe(3);
  });

  it('blocks profanity even when spaced out', () => {
    expect(containsBlockedWords('f u c k')).toBe(true);
    expect(containsBlockedWords('ขอให้สอบผ่าน')).toBe(false);
    expect(validateWish('เหี้ย').ok).toBe(false);
  });

  it('generates a valid default display name', () => {
    const name = generateDisplayName(() => 0.5);
    expect(validateDisplayName(name).ok).toBe(true);
  });
});

describe('animation determinism', () => {
  it('derives identical parameters from the same id', () => {
    expect(floatParams('abc')).toEqual(floatParams('abc'));
    expect(floatParams('abc')).not.toEqual(floatParams('abd'));
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('keeps parameters inside sane ranges', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = floatParams(`id-${i}`);
      expect(p.lane).toBeGreaterThanOrEqual(0);
      expect(p.lane).toBeLessThan(1);
      expect(p.duration).toBeGreaterThan(60);
      expect(p.duration).toBeLessThan(150);
    }
  });

  it('puts every viewer at the same point in the crossing', () => {
    const p = floatParams('shared');
    const floated = Date.parse('2026-11-24T13:00:00Z');
    const now = floated + 42_000;
    expect(crossingProgress(p, floated, now)).toBeCloseTo(p.startOffset + 42 / p.duration);
    expect(driftDelaySeconds(p, floated, now)).toBeCloseTo(-crossingProgress(p, floated, now) * p.duration);
  });

  it('loops progress between 0 and 1', () => {
    const p = floatParams('loop');
    const progress = crossingProgress(p, 0, 10 * 60 * 60 * 1000);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThan(1);
  });
});

const row = (overrides: Partial<KrathongRow> = {}): KrathongRow => ({
  id: 'k1',
  room_id: 'r1',
  owner_id: 'u1',
  display_name: 'บัว',
  design: DEFAULT_DESIGN,
  wish_visibility: 'public',
  public_wish: 'ขอให้มีความสุข',
  has_wish: true,
  floated_at: '2026-11-24T13:00:00Z',
  ...overrides,
});

describe('wish privacy on the client', () => {
  it('maps public wishes through', () => {
    expect(mapKrathongRow(row()).publicWish).toBe('ขอให้มีความสุข');
  });

  it('never exposes wish text on a private krathong', () => {
    const k = mapKrathongRow(row({ wish_visibility: 'private', public_wish: 'leaked?' }));
    expect(k.publicWish).toBeNull();
    expect(k.wishVisibility).toBe('private');
  });
});

describe('realtime merging', () => {
  const k = (id: string, at: string): Krathong => ({
    ...mapKrathongRow(row({ id, floated_at: at })),
  });

  it('deduplicates by id and sorts newest first', () => {
    const merged = mergeKrathongs(
      [k('a', '2026-11-24T13:00:00Z'), k('b', '2026-11-24T13:01:00Z')],
      [k('a', '2026-11-24T13:00:00Z'), k('c', '2026-11-24T13:02:00Z')],
    );
    expect(merged.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps at most 100 krathongs', () => {
    const many = Array.from({ length: 130 }, (_, i) =>
      k(`k${i}`, new Date(Date.UTC(2026, 10, 24, 13, 0, i)).toISOString()),
    );
    expect(mergeKrathongs([], many)).toHaveLength(100);
  });
});

describe('randomDesign', () => {
  it('always returns a valid design without coins', () => {
    for (let i = 0; i < 200; i++) {
      const design = randomDesign();
      expect(isValidDesign(design)).toBe(true);
      expect(design.coins).toBe(false);
      expect(design.flowers.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('stays valid at the edges of the random source', () => {
    expect(isValidDesign(randomDesign(() => 0))).toBe(true);
    expect(isValidDesign(randomDesign(() => 0.999999))).toBe(true);
  });
});

describe('BLANK_DESIGN', () => {
  it('is a valid bare krathong with nothing on it', () => {
    expect(isValidDesign(BLANK_DESIGN)).toBe(true);
    expect(BLANK_DESIGN.flowers).toEqual([]);
    expect(BLANK_DESIGN.candle).toBeNull();
    expect(BLANK_DESIGN.beads).toBeNull();
    expect(BLANK_DESIGN.incense).toBe(false);
    expect(BLANK_DESIGN.garland).toBe(false);
  });

  it('does not change how incomplete stored designs are filled in', () => {
    expect(normalizeDesign({})).toEqual(DEFAULT_DESIGN);
  });
});

describe('money in the design', () => {
  it('accepts a whole-baht amount as an optional ninth key', () => {
    expect(isValidDesign({ ...BLANK_DESIGN, money: 1 })).toBe(true);
    expect(isValidDesign({ ...BLANK_DESIGN, money: 99_999 })).toBe(true);
    expect(isValidDesign(BLANK_DESIGN)).toBe(true);
  });

  it('rejects fractions, zero, too much, strings and unknown keys', () => {
    expect(isValidDesign({ ...BLANK_DESIGN, money: 0 })).toBe(false);
    expect(isValidDesign({ ...BLANK_DESIGN, money: 12.5 })).toBe(false);
    expect(isValidDesign({ ...BLANK_DESIGN, money: 100_000 })).toBe(false);
    expect(isValidDesign({ ...BLANK_DESIGN, money: '100' })).toBe(false);
    expect(isValidDesign({ ...BLANK_DESIGN, money: undefined })).toBe(false);
    expect(isValidDesign({ ...BLANK_DESIGN, extra: true })).toBe(false);
  });

  it('keeps a valid amount and drops a bad one when normalizing', () => {
    expect(normalizeDesign({ shape: 'heart', money: 500 }).money).toBe(500);
    expect('money' in normalizeDesign({ shape: 'heart', money: -7 })).toBe(false);
  });
});

describe('breakdownMoney', () => {
  it('counts out the largest notes and coins first', () => {
    expect(breakdownMoney(1888)).toEqual({
      notes: [
        { value: 1000, count: 1 },
        { value: 500, count: 1 },
        { value: 100, count: 3 },
        { value: 50, count: 1 },
        { value: 20, count: 1 },
      ],
      coins: [
        { value: 10, count: 1 },
        { value: 5, count: 1 },
        { value: 2, count: 1 },
        { value: 1, count: 1 },
      ],
    });
  });

  it('always adds back up to the amount', () => {
    for (const amount of [1, 9, 19, 20, 99, 120, 345, 999, 2569, 99_999]) {
      const { notes, coins } = breakdownMoney(amount);
      const sum = [...notes, ...coins].reduce((t, p) => t + p.value * p.count, 0);
      expect(sum).toBe(amount);
    }
  });

  it('gives nothing for an invalid amount', () => {
    expect(breakdownMoney(0)).toEqual({ notes: [], coins: [] });
    expect(breakdownMoney(3.5)).toEqual({ notes: [], coins: [] });
  });

  it('describes the pieces in Thai', () => {
    expect(describeMoney(130)).toBe('แบงก์ 100 1 ใบ, แบงก์ 20 1 ใบ, เหรียญ 10 1 เหรียญ');
  });

  it('puts the largest notes on the front skewers and caps what is drawn', () => {
    const { notes, coins } = moneyLayers(1888);
    expect(notes.map((n) => n.key)).toEqual(['note-100-s2', 'note-100-s3', 'note-1000-s0', 'note-500-s1']);
    expect(coins.map((c) => c.key)).toEqual(['coin-10-s0', 'coin-5-s1', 'coin-2-s2', 'coin-1-s3']);
    const lots = moneyLayers(99_999);
    expect(lots.notes).toHaveLength(4);
    expect(lots.coins.map((c) => c.key)).toEqual(['coin-5-s0', 'coin-2-s1', 'coin-2-s2']);
    expect(moneyLayers(0)).toEqual({ notes: [], coins: [] });
  });
});
