import { useState } from 'react';
import { Coins } from 'lucide-react';
import { PROMPTPAY_ID, TIP_MAX, TIP_PRESETS } from '@/lib/promptpay';

/**
 * Optional money in the krathong, like the coins people put in real ones. Nothing is
 * required and nothing is shown to other people except a few coins on the krathong.
 */
export function TipPicker({ value, onChange }: { value: number | null; onChange: (amount: number | null) => void }) {
  const [custom, setCustom] = useState(value !== null && !TIP_PRESETS.includes(value) ? String(value) : '');
  if (!PROMPTPAY_ID) return null;

  const chip = (selected: boolean) =>
    `inline-flex min-h-12 cursor-pointer items-center rounded-full border px-4 text-sm tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${
      selected ? 'border-gold bg-gold/15 text-ink' : 'border-ink/15 text-ink/80 hover:border-ink/40'
    }`;

  const setCustomAmount = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 5);
    setCustom(clean);
    const n = Number(clean);
    onChange(clean && n > 0 ? Math.min(n, TIP_MAX) : null);
  };

  return (
    <fieldset className="rounded-3xl border border-gold/25 bg-gold/5 p-4">
      <legend className="flex items-center gap-2 px-1 text-sm text-ink">
        <Coins className="size-4 text-gold" aria-hidden />
        ใส่เงินลงกระทง <span className="text-mist">ไม่ใส่ก็ได้</span>
      </legend>
      <p className="mt-1 text-xs leading-relaxed text-mist">
        เงินจะโอนผ่านพร้อมเพย์เข้าบัญชีผู้ทำเว็บโดยตรง เพื่อช่วยค่าดูแลเว็บ ไม่ใช่การบริจาคให้วัดหรือการกุศล
        คนอื่นจะเห็นแค่เหรียญในกระทง ไม่เห็นจำนวนเงิน
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className={chip(value === null)}>
          <input type="radio" name="tip" checked={value === null} onChange={() => onChange(null)} className="sr-only" />
          ไม่ใส่
        </label>
        {TIP_PRESETS.map((amount) => (
          <label key={amount} className={chip(value === amount && custom === '')}>
            <input
              type="radio"
              name="tip"
              checked={value === amount && custom === ''}
              onChange={() => {
                setCustom('');
                onChange(amount);
              }}
              className="sr-only"
            />
            {amount} บาท
          </label>
        ))}
        <label className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm focus-within:border-gold">
          <span className="text-mist">ใส่เอง</span>
          <input
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="0"
            aria-label="จำนวนเงินที่ใส่เอง (บาท)"
            className="w-16 bg-transparent text-right text-base tabular-nums text-ink outline-none"
          />
          <span className="text-mist">บาท</span>
        </label>
      </div>
    </fieldset>
  );
}
