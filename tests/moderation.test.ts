import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BLOCKED_PATTERNS,
  NORMALIZE_FROM,
  NORMALIZE_TO,
  containsBlockedWords,
  normalizeForModeration,
} from '@/lib/moderation';
import { readInviteToken } from '@/features/rooms/invite';

describe('profanity filter', () => {
  it.each([
    'ไอ้เหี้ย',
    'เหี้ยะ',
    'เหี๊ย',
    'ค ว ย',
    'ค.ว.ย',
    'ค+ว+ย',
    'ควยยยยย',
    'สัส',
    'ส.ั.ส',
    'ศัส',
    'สัสสสส',
    'สัด',
    'อีดอก',
    'กะหรี่',
    'ไอ้ควาย',
    'แม่ง',
    'พ่อมึงตาย',
    'เย็ด',
    'ชิบหาย',
    'ฉิบหาย',
    'F U C K',
    'fuuuuck',
    'f*ck you',
    'sh1t',
    'b!tch'.replace('!', 'i'),
    'a$$hole',
    'wtf',
  ])('blocks %s', (text) => {
    expect(containsBlockedWords(text)).toBe(true);
  });

  it.each([
    'ขอให้สอบผ่าน',
    'ขอให้ครอบครัวสุขภาพแข็งแรง',
    'คุยกันทุกวันนะ',
    'เยส ได้งานแล้ว',
    'ดอกไม้เหี่ยวแล้วก็บานใหม่',
    'เวียนหัวคลื่นเหียน',
    'แม่งานทุกคนเก่งมาก',
    'สัดส่วนร่างกายดี',
    'หีบสมบัติ',
    'ห่านตัวใหญ่',
    'ดอกทองอุไรสวย',
    'Nigeria trip',
    'ปี 2569 ขอให้ปัง',
  ])('allows %s', (text) => {
    expect(containsBlockedWords(text)).toBe(false);
  });

  it('normalizes look-alikes, separators and repeats', () => {
    expect(normalizeForModeration('ศ ั ส!!!')).toBe('สัส');
    expect(normalizeForModeration('FuuCK')).toBe('fuck');
  });
});

describe('database filter stays in sync', () => {
  const sql = readFileSync('supabase/migrations/20261123000001_core_schema.sql', 'utf8');

  it('has every pattern from the client list', () => {
    for (const pattern of BLOCKED_PATTERNS) {
      const tone = '[่้๊๋]?';
      expect(sql, pattern).toContain(`'${pattern.replaceAll('${TONE}', tone)}'`);
    }
  });

  it('uses the same look-alike map', () => {
    expect(sql).toContain(`'${NORMALIZE_FROM}', '${NORMALIZE_TO}'`);
  });
});

describe('invite links', () => {
  it('reads a valid token from the fragment', () => {
    expect(readInviteToken('#t=abcDEF123_-abcDEF123_-xyz')).toBe('abcDEF123_-abcDEF123_-xyz');
  });

  it('rejects missing or malformed tokens', () => {
    expect(readInviteToken('')).toBeNull();
    expect(readInviteToken('#t=short')).toBeNull();
    expect(readInviteToken('#t=<script>alert(1)</script>aaaaaaaaaaaa')).toBeNull();
  });
});
