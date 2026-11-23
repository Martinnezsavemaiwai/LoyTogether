import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BLOCKED_LATIN,
  BLOCKED_THAI,
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
    'ค1วย',
    'คว@ย',
    'ควยยยยย',
    'คววววย',
    'ครวย',
    'คุวย',
    'ฅวย',
    'สัส',
    'ส.ั.ส',
    'ศัส',
    'สัด',
    'อีดอก',
    'กะหรี่',
    'กระหรี่',
    'ไอ้ควาย',
    'อีห่า',
    'แม่ง',
    'แมร่ง',
    'พ่อมึงตาย',
    'มึง',
    'เย็ด',
    'เงี่ยน',
    'ชิบหาย',
    'ฉิบหาย',
    'จัญไร',
    'จังไร',
    'จรรไร',
    'ส้นตีน',
    'หน้าหี',
    'จิ๋ม',
    'จู๋',
    'ตอแหล',
    'เชี่ย',
    'เชรี้ย',
    'ร่วมเพศ',
    'F U C K',
    'fuuuuck',
    'f*ck you',
    'sh1t',
    'b!tch',
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
    'ไปเที่ยวเชียงใหม่',
    'เชี่ยวชาญมากขึ้น',
    'ไปเชียร์บอล',
    'เหี้ยมโหดไม่เอา',
    'ขอให้ไอหายเร็วๆ',
    'กินกะหรี่ปั๊บอร่อย',
    'สัสดีจังหวัด',
    'แม่มดใจดี',
    'ขอให้สัตว์เลี้ยงแข็งแรง',
    'สาดน้ำสงกรานต์',
    'Nigeria trip',
    'ปี 2569 ขอให้ปัง',
    'ลอยนำกันเด้อ',
  ])('allows %s', (text) => {
    expect(containsBlockedWords(text)).toBe(false);
  });

  it('splits text into Thai and Latin streams', () => {
    expect(normalizeForModeration('ศ ั ส... FuuCK')).toEqual({ thai: 'สัส', latin: 'fuck' });
  });
});

describe('database filter stays in sync', () => {
  const sql = readFileSync('supabase/migrations/20261123000004_multi_parts_moderation.sql', 'utf8');
  const tone = '[่้๊๋]?';

  it('has every Thai and Latin pattern from the client lists', () => {
    for (const pattern of [...BLOCKED_THAI, ...BLOCKED_LATIN]) {
      expect(sql, pattern).toContain(`'${pattern.replaceAll('${T}', tone)}'`);
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
