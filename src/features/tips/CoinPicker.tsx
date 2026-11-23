import { useState } from 'react';
import { Coins } from 'lucide-react';
import { COIN_MAX } from '@/lib/promptpay';

/**
 * Money in the krathong, like the coins people drop into real ones. It only adds coins
 * to the krathong art: nothing is paid here. `0` means coins without a set amount.
 * Asking for real money comes later, after the krathong has floated (SupportPrompt).
 */
export function CoinPicker({ value, onChange }: { value: number | null; onChange: (amount: number | null) => void }) {
  const [custom, setCustom] = useState(value ? String(value) : '');

  const chip = (selected: boolean) =>
    `inline-flex min-h-12 cursor-pointer items-center rounded-full border px-4 text-sm tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${
      selected ? 'border-gold bg-gold/15 text-ink' : 'border-ink/15 text-ink/80 hover:border-ink/40'
    }`;

  const setCustomAmount = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 5);
    setCustom(clean);
    const n = Number(clean);
    onChange(clean && n > 0 ? Math.min(n, COIN_MAX) : 0);
  };

  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-sm text-mist">
        <Coins className="size-4 text-gold" aria-hidden />
        ใส่เงินลงกระทง
      </legend>
      <div className="flex flex-wrap gap-2">
        <label className={chip(value === null)}>
          <input
            type="radio"
            name="coins"
            checked={value === null}
            onChange={() => {
              setCustom('');
              onChange(null);
            }}
            className="sr-only"
          />
          ไม่ใส่
        </label>
        <label className={chip(value !== null)}>
          <input type="radio" name="coins" checked={value !== null} onChange={() => onChange(Number(custom) || 0)} className="sr-only" />
          ใส่เหรียญ
        </label>
        {value !== null && (
          <label className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm focus-within:border-gold">
            <span className="text-mist">จำนวน</span>
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="ตามใจ"
              aria-label="จำนวนเงินในกระทง (บาท) ไม่ใส่ก็ได้"
              className="w-16 bg-transparent text-right text-base tabular-nums text-ink outline-none placeholder:text-mist/70"
            />
            <span className="text-mist">บาท</span>
          </label>
        )}
      </div>
    </fieldset>
  );
}
