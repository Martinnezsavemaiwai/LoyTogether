import { containsBlockedWords } from './moderation';

export const DISPLAY_NAME_MAX = 24;
export const WISH_MAX = 280;

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

// Control characters and zero-width/bidi characters that can hide or reorder text.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function cleanText(raw: string): string {
  return raw.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/** Counts code points, the same way Postgres char_length does. */
export function charLength(text: string): number {
  return [...text].length;
}

function validateName(raw: string, max: number, label: string): ValidationResult {
  const value = cleanText(raw);
  if (value.length === 0) return { ok: false, error: `กรุณาใส่${label}` };
  if (charLength(value) > max) return { ok: false, error: `${label}ยาวได้ไม่เกิน ${max} ตัวอักษร` };
  if (containsBlockedWords(value)) return { ok: false, error: `${label}มีคำที่ไม่เหมาะสม ลองเปลี่ยนคำดูนะ` };
  return { ok: true, value };
}

export function validateDisplayName(raw: string): ValidationResult {
  return validateName(raw, DISPLAY_NAME_MAX, 'ชื่อที่แสดง');
}

/** An empty wish is allowed. Line breaks are kept, other invisible characters are removed. */
export function validateWish(raw: string): ValidationResult {
  const value = raw.replace(INVISIBLE, (ch) => (ch === '\n' ? ch : '')).replace(/\n{3,}/g, '\n\n').trim();
  if (charLength(value) > WISH_MAX) return { ok: false, error: `คำอธิษฐานยาวได้ไม่เกิน ${WISH_MAX} ตัวอักษร` };
  if (containsBlockedWords(value)) return { ok: false, error: 'คำอธิษฐานมีคำที่ไม่เหมาะสม ลองเปลี่ยนคำดูนะ' };
  return { ok: true, value };
}

const ADJECTIVES = ['ดาว', 'บัว', 'หิ่งห้อย', 'จันทร์', 'เทียน', 'ดาวเรือง', 'ระลอก', 'สายลม'];
const QUALITIES = ['ทอง', 'แก้ว', 'เพ็ญ', 'นวล', 'พราว', 'ฝัน', 'ใส', 'งาม'];

export function generateDisplayName(random: () => number = Math.random): string {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)] as T;
  const number = Math.floor(random() * 90) + 10;
  return `${pick(ADJECTIVES)}${pick(QUALITIES)} ${number}`;
}
