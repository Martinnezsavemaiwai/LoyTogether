import type {
  KrathongBase,
  KrathongBeads,
  KrathongCandle,
  KrathongDesign,
  KrathongFlower,
  KrathongShape,
} from '@/types/domain';
import { isValidMoney } from './money';

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
  { value: 'ice', label: 'น้ำแข็ง' },
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

export const BEADS: Option<KrathongBeads>[] = [
  { value: 'gold', label: 'ทอง' },
  { value: 'purple', label: 'ม่วง' },
  { value: 'pink', label: 'ชมพู' },
  { value: 'pearl', label: 'มุก' },
];

export const MAX_FLOWERS = 3;

/**
 * What the builder starts from: a bare base the visitor decorates themselves.
 * Separate from DEFAULT_DESIGN, which fills gaps in stored krathongs and must not change
 * how krathongs that already floated look.
 */
export const BLANK_DESIGN: KrathongDesign = {
  shape: 'lotus',
  base: 'banana_leaf',
  flowers: [],
  candle: null,
  incense: false,
  beads: null,
  garland: false,
  coins: false,
};

/** Fallback for missing or invalid fields in stored designs (see normalizeDesign). */
export const DEFAULT_DESIGN: KrathongDesign = {
  shape: 'lotus',
  base: 'banana_leaf',
  flowers: ['marigold'],
  candle: 'golden',
  incense: true,
  beads: 'gold',
  garland: false,
  coins: false,
};

/** A ready-made krathong for visitors who would rather not choose every part. */
export function randomDesign(rand: () => number = Math.random): KrathongDesign {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length]!;
  const pool = FLOWERS.map((f) => f.value);
  const flowers: KrathongFlower[] = [];
  const count = 1 + Math.floor(rand() * MAX_FLOWERS);
  while (flowers.length < count) {
    const kind = pick(pool.filter((f) => !flowers.includes(f)));
    flowers.push(kind);
  }
  return {
    shape: pick(SHAPES).value,
    base: pick(BASES).value,
    flowers,
    candle: pick(CANDLES).value,
    incense: rand() < 0.7,
    beads: rand() < 0.75 ? pick(BEADS).value : null,
    garland: rand() < 0.35,
    coins: false,
  };
}

const values = <T extends string>(list: Option<T>[]) => list.map((o) => o.value) as readonly T[];
const SHAPE_V = values(SHAPES);
const BASE_V = values(BASES);
const FLOWER_V = values(FLOWERS);
const CANDLE_V = values(CANDLES);
const BEAD_V = values(BEADS);
const KEYS = ['shape', 'base', 'flowers', 'candle', 'incense', 'beads', 'garland', 'coins'];
const OPTIONAL_KEYS = ['money'];

const isOneOf = <T,>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

export function isValidDesign(value: unknown): value is KrathongDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>;
  const extra = Object.keys(d).filter((k) => !KEYS.includes(k));
  if (!KEYS.every((k) => k in d) || !extra.every((k) => OPTIONAL_KEYS.includes(k))) return false;
  if ('money' in d && !isValidMoney(d.money)) return false;
  const flowers = d.flowers;
  return (
    isOneOf(SHAPE_V, d.shape) &&
    isOneOf(BASE_V, d.base) &&
    Array.isArray(flowers) &&
    flowers.length <= MAX_FLOWERS &&
    new Set(flowers).size === flowers.length &&
    flowers.every((f) => isOneOf(FLOWER_V, f)) &&
    (d.candle === null || isOneOf(CANDLE_V, d.candle)) &&
    typeof d.incense === 'boolean' &&
    (d.beads === null || isOneOf(BEAD_V, d.beads)) &&
    typeof d.garland === 'boolean' &&
    typeof d.coins === 'boolean'
  );
}

/**
 * Accepts the current shape, the older single-choice shape
 * ({ flower, candle, decoration }) and partial or tampered data, field by field.
 */
export function normalizeDesign(value: unknown): KrathongDesign {
  if (isValidDesign(value)) return value;
  const d = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out: KrathongDesign = { ...DEFAULT_DESIGN, flowers: [...DEFAULT_DESIGN.flowers] };
  if (isOneOf(SHAPE_V, d.shape)) out.shape = d.shape;
  if (isOneOf(BASE_V, d.base)) out.base = d.base;
  if (Array.isArray(d.flowers)) {
    out.flowers = [...new Set(d.flowers.filter((f): f is KrathongDesign['flowers'][number] => isOneOf(FLOWER_V, f)))].slice(
      0,
      MAX_FLOWERS,
    );
  } else if (isOneOf(FLOWER_V, d.flower)) {
    out.flowers = [d.flower];
  }
  if (d.candle === null) out.candle = null;
  else if (isOneOf(CANDLE_V, d.candle)) out.candle = d.candle;
  if (typeof d.incense === 'boolean') out.incense = d.incense;
  if (d.beads === null) out.beads = null;
  else if (isOneOf(BEAD_V, d.beads)) out.beads = d.beads;
  else if (isOneOf(BEAD_V, d.decoration)) out.beads = d.decoration;
  else if (d.decoration === 'jasmine_garland') out.beads = null;
  if (typeof d.garland === 'boolean') out.garland = d.garland;
  else if (d.decoration === 'jasmine_garland') out.garland = true;
  if (typeof d.coins === 'boolean') out.coins = d.coins;
  if (isValidMoney(d.money)) out.money = d.money;
  return out;
}

/**
 * Nine flower slots sit in a ring, grouped into three phases (slot % 3).
 * One kind fills all three phases; two kinds split 2:1; three kinds take one each.
 */
export function flowerPhases(flowers: KrathongFlower[]): { kind: KrathongFlower; phase: 0 | 1 | 2 }[] {
  if (flowers.length === 0) return [];
  if (flowers.length === 1) return [0, 1, 2].map((p) => ({ kind: flowers[0]!, phase: p as 0 | 1 | 2 }));
  if (flowers.length === 2)
    return [
      { kind: flowers[0]!, phase: 0 },
      { kind: flowers[1]!, phase: 1 },
      { kind: flowers[0]!, phase: 2 },
    ];
  return flowers.slice(0, 3).map((kind, i) => ({ kind, phase: i as 0 | 1 | 2 }));
}
