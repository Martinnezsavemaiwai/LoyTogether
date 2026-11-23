import type {
  KrathongBase,
  KrathongCandle,
  KrathongDecoration,
  KrathongDesign,
  KrathongFlower,
  KrathongShape,
} from '@/types/domain';

export interface Option<T extends string> {
  value: T;
  label: string;
}

export const SHAPES: Option<KrathongShape>[] = [
  { value: 'lotus', label: 'ดอกบัว' },
  { value: 'circle', label: 'วงกลม' },
  { value: 'heart', label: 'หัวใจ' },
];

export const BASES: Option<KrathongBase>[] = [
  { value: 'banana_leaf', label: 'ใบตองกลีบแหลม' },
  { value: 'banana_rose', label: 'ใบตองกลีบกุหลาบ' },
  { value: 'flower', label: 'กลีบดอกไม้' },
  { value: 'bread', label: 'ขนมปัง' },
  { value: 'banana_trunk', label: 'หยวกกล้วย' },
];

export const FLOWERS: Option<KrathongFlower>[] = [
  { value: 'marigold', label: 'ดาวเรือง' },
  { value: 'rose', label: 'กุหลาบ' },
  { value: 'orchid', label: 'กล้วยไม้' },
  { value: 'lotus', label: 'บัวตูม' },
  { value: 'jasmine', label: 'มะลิ' },
  { value: 'chrysanthemum', label: 'เบญจมาศ' },
];

export const CANDLES: Option<KrathongCandle>[] = [
  { value: 'golden', label: 'ทอง' },
  { value: 'white', label: 'ขาว' },
  { value: 'pink', label: 'ชมพู' },
  { value: 'red', label: 'แดง' },
];

export const DECORATIONS: Option<KrathongDecoration>[] = [
  { value: 'gold', label: 'ลูกปัดทอง' },
  { value: 'purple', label: 'ลูกปัดม่วง' },
  { value: 'pink', label: 'ลูกปัดชมพู' },
  { value: 'pearl', label: 'มุก' },
  { value: 'jasmine_garland', label: 'มาลัยมะลิ' },
];

export const DEFAULT_DESIGN: KrathongDesign = {
  shape: 'lotus',
  base: 'banana_leaf',
  flower: 'marigold',
  candle: 'golden',
  decoration: 'gold',
};

const ALLOWED = {
  shape: SHAPES.map((o) => o.value),
  base: BASES.map((o) => o.value),
  flower: FLOWERS.map((o) => o.value),
  candle: CANDLES.map((o) => o.value),
  decoration: DECORATIONS.map((o) => o.value),
} as const;

const KEYS = Object.keys(ALLOWED) as (keyof KrathongDesign)[];

export function isValidDesign(value: unknown): value is KrathongDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== KEYS.length) return false;
  return KEYS.every((key) => (ALLOWED[key] as readonly unknown[]).includes(record[key]));
}

/** Falls back to the default for any unknown value, e.g. from old or tampered rows. */
export function normalizeDesign(value: unknown): KrathongDesign {
  if (isValidDesign(value)) return value;
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_DESIGN };
  for (const key of KEYS) {
    const v = record[key];
    if ((ALLOWED[key] as readonly unknown[]).includes(v)) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
