/**
 * Money tucked into a krathong, for show only: nothing is paid and no real money moves.
 *
 * The visitor types any whole-baht amount; it is broken into the notes and coins a
 * person would actually put in (largest first) and shown with sprites modelled in
 * Blender (blender/money.py): notes folded and stuck upright on bamboo skewers behind
 * the candle, coins lying on the plate in front. They follow the real currency's
 * colours, sizes and metals but never reproduce banknote artwork or a portrait: the
 * Bank of Thailand requires approval for any reproduction of a banknote image.
 */

/** Largest amount accepted; plenty for show, small enough to stay a whole number everywhere. */
export const MONEY_MAX = 99_999;

export const NOTE_VALUES = [1000, 500, 100, 50, 20] as const;
export const COIN_VALUES = [10, 5, 2, 1] as const;
export type NoteValue = (typeof NOTE_VALUES)[number];
export type CoinValue = (typeof COIN_VALUES)[number];

export interface MoneyPart<V extends number> {
  value: V;
  count: number;
}

export interface MoneyBreakdown {
  notes: MoneyPart<NoteValue>[];
  coins: MoneyPart<CoinValue>[];
}

export function isValidMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MONEY_MAX;
}

/** Largest denominations first, the way change is counted out. */
export function breakdownMoney(amount: number): MoneyBreakdown {
  let left = isValidMoney(amount) ? amount : 0;
  const take = <V extends number>(values: readonly V[]) =>
    values.flatMap((value) => {
      const count = Math.floor(left / value);
      left -= count * value;
      return count > 0 ? [{ value, count }] : [];
    });
  const notes = take(NOTE_VALUES);
  const coins = take(COIN_VALUES);
  return { notes, coins };
}

/**
 * Rendered slots (blender/money.py): 4 skewers behind the candle, 4 places on the plate.
 * Counting change out largest first never needs more than 4 coins (10 + 5 + 2 + 2).
 */
export const NOTE_SLOTS = 4;
export const COIN_SLOTS = 4;

/** Paint order, back to front, so nearer pieces overlap farther ones. */
const NOTE_ORDER = [2, 3, 0, 1];
const COIN_ORDER = [0, 1, 2, 3];

function expand<V extends number>(parts: MoneyPart<V>[], max: number): V[] {
  const out: V[] = [];
  for (const part of parts) for (let i = 0; i < part.count && out.length < max; i++) out.push(part.value);
  return out;
}

export interface MoneyLayers {
  /** Stacked before the candle: the skewered notes stand behind it. */
  notes: { key: string; src: string }[];
  /** Stacked after the front flowers: the coins lie on the near side of the plate. */
  coins: { key: string; src: string }[];
}

/**
 * Which money sprites to stack for an amount. The largest notes take the front skewers;
 * a big amount shows at most 4 notes, so it stays a krathong, not a vault.
 */
export function moneyLayers(amount: number): MoneyLayers {
  const { notes, coins } = breakdownMoney(amount);
  const shownNotes = expand(notes, NOTE_SLOTS);
  const shownCoins = expand(coins, COIN_SLOTS);
  const noteAt = new Map(shownNotes.map((value, i) => [i, value]));
  const coinAt = new Map(shownCoins.map((value, i) => [i, value]));
  return {
    notes: NOTE_ORDER.filter((slot) => noteAt.has(slot)).map((slot) => {
      const value = noteAt.get(slot)!;
      return { key: `note-${value}-s${slot}`, src: `/krathong/note-${value}-s${slot}.webp` };
    }),
    coins: COIN_ORDER.filter((slot) => coinAt.has(slot)).map((slot) => {
      const value = coinAt.get(slot)!;
      return { key: `coin-${value}-s${slot}`, src: `/krathong/coin-${value}-s${slot}.webp` };
    }),
  };
}

/** Thai summary of what goes in, e.g. "แบงก์ 100 2 ใบ เหรียญ 10 1 เหรียญ". */
export function describeMoney(amount: number): string {
  const { notes, coins } = breakdownMoney(amount);
  const parts = [
    ...notes.map((n) => `แบงก์ ${n.value.toLocaleString('th-TH')} ${n.count} ใบ`),
    ...coins.map((c) => `เหรียญ ${c.value} ${c.count} เหรียญ`),
  ];
  return parts.join(', ');
}
