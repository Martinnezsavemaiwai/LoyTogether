import { ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/** Offered right after floating: keep this krathong as a picture. */
export function MemoryPrompt({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="memory-ask-title"
      aria-describedby="memory-ask-desc"
      className="lt-rise fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[205] rounded-[1.75rem] border border-gold/30 bg-surface/95 p-5 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.7)] backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[23rem]"
    >
      <div className="flex items-start gap-3">
        <ImageIcon className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="memory-ask-title" className="font-semibold text-ink">
            เก็บกระทงใบนี้ไว้เป็นการ์ดไหม
          </h2>
          <p id="memory-ask-desc" className="mt-1 text-sm leading-relaxed text-mist">ได้รูปกระทงของคุณกับที่ลอยคืนนี้ ไว้ดูเองหรือส่งให้เพื่อน</p>
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
          ทำการ์ด
        </Button>
        <Button variant="ghost" onClick={onDismiss} className="flex-1">
          ไว้ก่อน
        </Button>
      </div>
    </aside>
  );
}
