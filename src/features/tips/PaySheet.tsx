import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/Button';
import { PROMPTPAY_ID, PROMPTPAY_NAME, promptPayPayload } from '@/lib/promptpay';

/** PromptPay QR for the amount the visitor chose. Payment happens in their banking app. */
export function PaySheet({ amount, onClose }: { amount: number; onClose: () => void }) {
  const payload = useMemo(() => (PROMPTPAY_ID ? promptPayPayload(PROMPTPAY_ID, amount) : null), [amount]);
  const [src, setSrc] = useState<string | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const failed = !payload || renderFailed;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!payload) return;
    QRCode.toDataURL(payload, { width: 560, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b1229', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setRenderFailed(true));
  }, [payload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="pay-title"
      className="lt-rise fixed inset-x-0 bottom-0 z-[210] max-h-[88svh] overflow-y-auto rounded-t-[2rem] border-t border-gold/30 bg-surface/97 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-10px_rgb(0_0_0/0.6)] backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[24rem] sm:rounded-[2rem] sm:border"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="pay-title" className="text-xl font-semibold">
            ใส่เงิน {amount.toLocaleString('th-TH')} บาท
          </h2>
          <p className="mt-1 text-sm text-mist">สแกนด้วยแอปธนาคารเพื่อโอนผ่านพร้อมเพย์</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-mist hover:bg-ink/10 hover:text-ink"
          aria-label="ปิด"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {failed ? (
        <p className="mt-5 text-danger">สร้าง QR ไม่สำเร็จ ลองใหม่อีกครั้งภายหลังนะ</p>
      ) : (
        <div className="mx-auto mt-5 w-full max-w-[17rem] overflow-hidden rounded-2xl bg-white p-2">
          {src ? (
            <img src={src} alt={`QR พร้อมเพย์ ${amount} บาท`} className="block h-auto w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse bg-ink/10" />
          )}
        </div>
      )}

      <ol className="mt-5 space-y-1.5 text-sm text-mist">
        <li>เปิดแอปธนาคารแล้วสแกน QR นี้</li>
        <li>ถ้าเปิดเว็บจากมือถือเครื่องเดียวกัน ให้กดบันทึกรูป แล้วเลือกรูปจากแกลเลอรีในแอปธนาคาร</li>
        <li>
          ดูชื่อบัญชีในแอปก่อนกดยืนยัน{PROMPTPAY_NAME ? ` ต้องเป็น ${PROMPTPAY_NAME}` : ''}
        </li>
      </ol>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {src && (
          <a
            href={src}
            download={`loynamkan-promptpay-${amount}.png`}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-ink/20 px-6 text-ink no-underline hover:border-gold/60 hover:text-gold"
          >
            <Download className="size-4" aria-hidden />
            บันทึกรูป QR
          </a>
        )}
        <Button onClick={onClose} className="flex-1">
          เสร็จแล้ว
        </Button>
      </div>
      <p className="mt-4 text-xs text-mist">ไม่โอนก็ไม่เป็นไรนะ กระทงของคุณลอยไปเรียบร้อยแล้ว</p>
    </aside>
  );
}
