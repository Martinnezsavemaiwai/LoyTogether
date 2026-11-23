/**
 * Profanity filter for names, room titles and wishes.
 *
 * Text is normalized into two streams so mixed tricks ("ค1วย", "คว@ย", "f*ck") cannot hide a word:
 *   Thai stream  - only Thai characters, repeated characters collapsed ("คววววย" -> "ควย")
 *   Latin stream - leet and look-alikes mapped, only a-z, repeats collapsed ("FuUuCK" -> "fuck")
 * Spaces and punctuation vanish in both, so spaced-out words are caught too.
 *
 * Word list: curated from SIT-SandBox/thai-bad-words (MIT) root words and the
 * LDNOOBW V2 Thai list (CC0), keeping roots that catch their compounds by substring
 * and dropping entries that are ordinary words. Lookaheads/lookbehinds exclude real
 * words that contain a root (เหี่ยว, เชียงใหม่, หีบ, สัดส่วน, กะหรี่ปั๊บ, แม่งาน ...).
 * Patterns are written in normalized form (ศ/ษ already ส, repeats collapsed).
 * Patterns use only regex syntax JS and Postgres ARE share. Keep this file and
 * public.contains_blocked_words in supabase/migrations in sync (a test checks it).
 */

// Look-alike or leet characters mapped to the letter they imitate.
export const NORMALIZE_FROM = '0134578@$!|ฅฃศษ';
export const NORMALIZE_TO = 'oieastbasiiคขสส';

const T = '[่้๊๋]?'; // optional tone mark

export const BLOCKED_THAI: string[] = [
  // sexual / genital
  'ค[รุ]?วย',
  'ฆวย',
  'ควๅย',
  'จิ๋ม',
  'จู๋',
  '(?<!เ)หี(?!บ)',
  'หมอย',
  'แตด',
  'เย[็้]?ด',
  'โม[๊้]ก',
  'เงี่ยน',
  'ร่าน',
  'ชักว่าว',
  'น้ำว่าว',
  'น้ำกาม',
  'ร่วมเพส', // ร่วมเพศ after ศ -> ส
  'ขายตัว',
  'ข่มขืน',
  'ก[ะา]หรี่(?!ปั)',
  'กระหรี่(?!ปั)',
  'กระรี่',
  'ดอกทอง(?!อุไร|กวาว)',
  'ดอกกระหรี่',
  // the เหี้ย family and minced forms
  `เห${T}ี${T}ย(?![วนงม])`,
  `เชี${T}ย(?![วรนง])`,
  'เชรี[่้]?ย',
  'เอี้ย(?![วด])',
  // animals / curses
  'สัส(?!ดี)',
  'สัด(?!ส่วน|ว)',
  '(ไอ้|ไอ|อี)(สาด|สัตว์|ห่า(?![ยรงนก])|ควาย|โง่|เวร|เปรต|ตุ๊ด|แรด|ดอก|บ้า|ชาติ|เลว|หน้าหี)',
  'แม่ง(?!า)',
  'แมร่ง',
  'พ่อง(?!า)',
  '(พ่อ|แม่)(มึง|เมิง|มรึง)',
  'มึงตาย',
  'มึง',
  'เมิง',
  'มรึง',
  '[ชฉ]ิ?บหาย',
  'จ(ัญ|ัง|ัน|ร)ไร', // จรรไร collapses to จรไร
  'ระยำ',
  'ส้นต[ร]?ีน',
  '(หิว|ฝ่า|ปลาย|หัว)ต[ร]?ีน',
  'ตีนผี',
  'ตอแหล',
  'บัดซบ',
  'สันดาน',
  'ชาติ(หมา|ชั่ว)',
  'ลูก(หมา|กะหรี่|กระหรี่)',
  'ชิงหมาเกิด',
  'ถุย',
  'เฮงซวย',
  'อัปรีย์',
  'เดรัจฉาน',
  'สถุ[นล]',
  'ปัญญาอ่อน',
  'หน้าด้าน',
  'หน้า(หี|ตัวเมีย|หมา|ส้นตีน|ปลวก)',
  'ตูด',
  'ทุเรส', // ทุเรศ after ศ -> ส
  'นิกเกอร์',
];

export const BLOCKED_LATIN: string[] = [
  'fuck',
  'fck',
  'phuck',
  'shit',
  'bitch',
  'biatch',
  'cunt',
  'pusy',
  'ashole',
  'bastard',
  'slut',
  'whore',
  'niger(?!ia)',
  'niga',
  'fagot',
  'retard',
  'wanker',
  'twat',
  'jerkof',
  'killyourself',
  'dumbas',
  'wtf',
  'stfu',
];

const THAI = BLOCKED_THAI.map((p) => new RegExp(p));
const LATIN = BLOCKED_LATIN.map((p) => new RegExp(p));

function mapLookAlikes(text: string): string {
  return [...text.normalize('NFKC').toLowerCase()]
    .map((ch) => {
      const i = NORMALIZE_FROM.indexOf(ch);
      return i === -1 ? ch : NORMALIZE_TO[i];
    })
    .join('');
}

const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');

export function normalizeForModeration(text: string): { thai: string; latin: string } {
  const mapped = mapLookAlikes(text);
  return {
    thai: collapse(mapped.replace(/[^ก-๛]/g, '')),
    latin: collapse(mapped.replace(/[^a-z]/g, '')),
  };
}

export function containsBlockedWords(text: string): boolean {
  const { thai, latin } = normalizeForModeration(text);
  return THAI.some((re) => re.test(thai)) || LATIN.some((re) => re.test(latin));
}
