import { HandCoins, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Shown after a krathong has floated. Floating is free; this is an optional,
 * any-amount contribution toward the cost of the site, and it says plainly where
 * the money goes.
 */
export function SupportPrompt({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  return (
    <aside
      aria-labelledby="support-title"
      className="lt-rise fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[205] rounded-[1.75rem] border border-gold/30 bg-surface/95 p-5 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.7)] backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[23rem]"
    >
      <div className="flex items-start gap-3">
        <HandCoins className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="support-title" className="font-semibold text-ink">
            ช่วยค่ากระทงสักหน่อยไหม
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-mist">
            ลอยฟรีอยู่แล้วนะ ถ้าอยากช่วยค่าดูแลเว็บ ให้เท่าไหร่ก็ได้ตามใจ
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-mist hover:bg-ink/10 hover:text-ink"
          aria-label="ปิด"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={onAccept} className="flex-1">
          ช่วยค่ากระทง
        </Button>
        <Button variant="ghost" onClick={onDismiss} className="flex-1">
          ไว้ก่อน
        </Button>
      </div>
    </aside>
  );
}
