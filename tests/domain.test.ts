import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, isValidDesign, normalizeDesign } from '@/features/krathong/options';
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
  validateKrathongName,
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

  it('rejects unknown values and extra keys', () => {
    expect(isValidDesign({ ...DEFAULT_DESIGN, candle: 'neon' })).toBe(false);
    expect(isValidDesign({ ...DEFAULT_DESIGN, extra: 'x' })).toBe(false);
    expect(isValidDesign(null)).toBe(false);
    expect(isValidDesign([])).toBe(false);
  });

  it('normalizes broken designs field by field', () => {
    expect(normalizeDesign({ shape: 'heart', candle: 'neon' })).toEqual({
      ...DEFAULT_DESIGN,
      shape: 'heart',
    });
  });
});

describe('text validation', () => {
  it('requires a display name and limits it to 24 characters', () => {
    expect(validateDisplayName('   ').ok).toBe(false);
    expect(validateDisplayName('ก'.repeat(25)).ok).toBe(false);
    expect(validateDisplayName('  บัว   ทอง ')).toEqual({ ok: true, value: 'บัว ทอง' });
  });

  it('strips invisible and bidi characters from names', () => {
    expect(validateKrathongName('กระทง​‮ทอง')).toEqual({ ok: true, value: 'กระทงทอง' });
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
  krathong_name: 'กระทง',
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
