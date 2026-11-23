import { describe, expect, it } from 'vitest';
import { thaiDate, wrapText } from '@/features/memory/memoryCard';

// Every character is 10px wide, so maxWidth 100 fits 10 characters.
const measure = (s: string) => Array.from(s).length * 10;

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('ขอให้มีความสุข', 200, measure)).toEqual(['ขอให้มีความสุข']);
  });

  it('breaks Thai between words, never inside one', () => {
    const lines = wrapText('ขอให้มีความสุขมากๆ ตลอดปี', 100, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
    expect(lines.join('').replace(/\s/g, '')).toBe('ขอให้มีความสุขมากๆตลอดปี');
  });

  it('cuts a word longer than the line by characters', () => {
    const lines = wrapText('a'.repeat(25), 100, measure);
    expect(lines).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
  });

  it('honours line breaks the visitor typed', () => {
    expect(wrapText('บรรทัดแรก\nบรรทัดสอง', 500, measure)).toEqual(['บรรทัดแรก', 'บรรทัดสอง']);
  });
});

describe('thaiDate', () => {
  it('uses the Buddhist year', () => {
    expect(thaiDate('2026-11-24T14:00:00Z')).toContain('2569');
    expect(thaiDate('2026-11-24T14:00:00Z')).toContain('พฤศจิกายน');
  });
});
