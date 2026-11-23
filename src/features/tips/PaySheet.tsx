import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PROMPTPAY_ID, PROMPTPAY_NAME, promptPayPayload } from '@/lib/promptpay';

/**
 * PromptPay QR with no amount set: the payer types whatever they like in their banking
 * app. Payment happens there; the site cannot see whether it did.
 */
export function PaySheet({ onClose }: { onClose: () => void }) {
  const payload = useMemo(() => (PROMPTPAY_ID ? promptPayPayload(PROMPTPAY_ID) : null), []);
  const [src, setSrc] = useState<string | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const failed = !payload || renderFailed;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    // qrcode is only needed by the few visitors who open this sheet, so it loads on demand.
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(payload, { width: 560, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b1229', light: '#ffffff' } }),
      )
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });
    return () => {
      cancelled = true;
    };
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
            ช่วยค่ากระทง
          </h2>
          <p className="mt-1 text-sm text-mist">สแกนด้วยแอปธนาคาร ใส่เท่าไหร่ก็ได้</p>
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
            <img src={src} alt="QR พร้อมเพย์สำหรับช่วยค่ากระทง" className="block h-auto w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse bg-ink/10" />
          )}
        </div>
      )}

      {PROMPTPAY_NAME && (
        <p className="mt-3 text-center text-sm text-ink">
          ชื่อบัญชี <span className="font-semibold">{PROMPTPAY_NAME}</span>
        </p>
      )}
      <p className="mt-3 text-sm text-mist">ใช้มือถือเครื่องนี้อยู่ กดบันทึกรูปแล้วเปิดในแอปธนาคารได้</p>
      <p className="mt-1 text-xs text-mist">เงินเข้าคนทำเว็บโดยตรงเป็นค่าดูแลเว็บ ไม่ใช่การบริจาค</p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {src && (
          <a
            href={src}
            download="loynamkan-promptpay.png"
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
    </aside>
  );
}
