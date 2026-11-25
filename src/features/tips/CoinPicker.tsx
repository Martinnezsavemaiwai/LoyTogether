import { useState } from 'react';
import { Coins } from 'lucide-react';
import { describeMoney, MONEY_MAX } from '@/features/krathong/money';

/** One tap for the amounts people usually tuck in; anything else is typed. */
const QUICK = [20, 99, 100, 500, 1000] as const;

const chip = (selected: boolean) =>
  `inline-flex min-h-12 cursor-pointer items-center rounded-full border px-4 text-sm tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${
    selected ? 'border-gold bg-gold/15 text-ink' : 'border-ink/15 text-ink/80 hover:border-ink/40'
  }`;

/**
 * Money in the krathong, like the notes and coins people tuck into real ones. Any
 * whole-baht amount is counted out into notes and coins and drawn on the krathong.
 * It only changes the picture: nothing is paid here. Real money is only ever a quiet
 * link on the river after floating (PaySheet).
 */
export function CoinPicker({
  money,
  onMoneyChange,
}: {
  money: number | undefined;
  onMoneyChange: (money: number | undefined) => void;
}) {
  const [typed, setTyped] = useState(money && !QUICK.includes(money as (typeof QUICK)[number]) ? String(money) : '');

  // What was typed only shows while it is still the amount; a reset or random design elsewhere clears it.
  const shown = typed && money !== undefined && Math.min(Number(typed), MONEY_MAX) === money ? typed : '';

  // A quick pick clears the typed amount so the two never disagree.
  const pick = (value: number | undefined) => {
    setTyped('');
    onMoneyChange(value);
  };

  const onType = (raw: string) => {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 5);
    setTyped(digits);
    const n = Number(digits);
    onMoneyChange(digits && n >= 1 ? Math.min(n, MONEY_MAX) : undefined);
  };

  return (
    <fieldset>
      <legend className="mb-3">
        <span className="flex items-center gap-2 font-medium text-ink">
          <Coins className="size-4 text-gold" aria-hidden />
          ใส่เงินลงกระทง
        </span>
        <span className="mt-0.5 block text-sm text-mist">ใส่ไว้ในรูปกระทงเฉยๆ ไม่ได้จ่ายเงินจริง</span>
      </legend>

      <div className="flex flex-wrap gap-2">
        <label className={chip(money === undefined)}>
          <input type="radio" name="money" checked={money === undefined} onChange={() => pick(undefined)} className="sr-only" />
          ไม่ใส่
        </label>
        {QUICK.map((value) => (
          <label key={value} className={chip(money === value && !shown)}>
            <input
              type="radio"
              name="money"
              checked={money === value && !shown}
              onChange={() => pick(value)}
              className="sr-only"
            />
            {value.toLocaleString('th-TH')}
            <span className="sr-only">บาท</span>
          </label>
        ))}
      </div>

      <label className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl border border-ink/15 bg-surface px-4 focus-within:border-gold">
        <span className="shrink-0 text-sm text-mist">หรือกรอกเอง</span>
        <input
          inputMode="numeric"
          value={shown}
          onChange={(e) => onType(e.target.value)}
          placeholder="จำนวน"
          aria-label="จำนวนเงินในกระทง (บาท)"
          className="min-w-0 flex-1 bg-transparent text-right text-base tabular-nums text-ink outline-none placeholder:text-mist/70"
        />
        <span className="shrink-0 text-sm text-mist">บาท</span>
      </label>

      {money !== undefined && (
        <p className="mt-2 text-sm text-ink/85" aria-live="polite">
          {describeMoney(money)}
        </p>
      )}
    </fieldset>
  );
}
