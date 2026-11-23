/**
 * Profanity filter. Text is normalized first so spacing, punctuation, repeated
 * letters, leetspeak and look-alike Thai letters cannot slip a word through.
 *
 * Keep NORMALIZE_MAP, the normalization steps and BLOCKED_PATTERNS in sync with
 * public.normalize_for_moderation / public.contains_blocked_words in
 * supabase/migrations. Patterns are matched after repeated letters collapse (so "asshole" is written
 * "ashole") and use only syntax that both JS and Postgres ARE
 * regex support: character classes, ?, |, (?! ) lookahead and (?<! ) lookbehind.
 */

// Look-alike or leet characters mapped to the letter they imitate.
export const NORMALIZE_FROM = '013457@$ฅฃศษ';
export const NORMALIZE_TO = 'oieastasคขสส';

const TONE = '[่้๊๋]?';

export const BLOCKED_PATTERNS: string[] = [
  // Thai
  `เห${TONE}ี${TONE}ย(?![วน])`, // เหี้ย in any tone spelling, not เหี่ยว or คลื่นเหียน
  `ควย`,
  `เย[็]?ด`,
  `(?<!เ)หี(?![บ])`,
  `แตด`,
  `จิ๋ม`,
  `สัส`,
  `สัด(?!ส่วน|ว)`,
  `ส้นตีน`,
  `ตีนผี`,
  `อีดอก`,
  `ดอกทอง(?!อุไร|กวาว)`,
  `กะหรี่`,
  `กระหรี่`,
  `ร่าน`,
  `แรดดอก`,
  `เงี่ยน`,
  `ชักว่าว`,
  `ระยำ`,
  `จัญไร`,
  `[ชฉ]ิบหาย`,
  `ห่าราก`,
  `(ไอ้|อี)ห่า(?![นง])`,
  `(ไอ้|อี)สัตว์`,
  `(ไอ้|อี)ควาย`,
  `(ไอ้|อี)เวร`,
  `(ไอ้|อี)ชาติหมา`,
  `ชาติหมา`,
  `สันดาน`,
  `แม่ง(?!า)`,
  `พ่อง(?!า)`,
  `(พ่อ|แม่)มึง`,
  `มึงตาย`,
  `ตอแหล`,
  `หน้าโง่`,
  `ไอ้โง่`,
  `อีโง่`,
  // English
  `fuck`,
  `fck`,
  `phuck`,
  `shit`,
  `bitch`,
  `biatch`,
  `cunt`,
  `pusy`,
  `ashole`,
  `bastard`,
  `slut`,
  `whore`,
  `niger(?!ia)`,
  `niga`,
  `fagot`,
  `retard`,
  `wtf`,
  `stfu`,
];

const BLOCKED = BLOCKED_PATTERNS.map((p) => new RegExp(p));

export function normalizeForModeration(text: string): string {
  let out = text.normalize('NFKC').toLowerCase();
  out = [...out]
    .map((ch) => {
      const i = NORMALIZE_FROM.indexOf(ch);
      return i === -1 ? ch : NORMALIZE_TO[i];
    })
    .join('');
  // Keep only Latin letters and the Thai block, so "ค.ว.ย" or "f u c k" collapse.
  out = out.replace(/[^a-zก-๛]/g, '');
  // Collapse repeated characters: "ควยยยย" -> "ควย", "fuuuck" -> "fuck".
  out = out.replace(/(.)\1+/g, '$1');
  return out;
}

export function containsBlockedWords(text: string): boolean {
  const normalized = normalizeForModeration(text);
  return BLOCKED.some((re) => re.test(normalized));
}
