import { useEffect, useMemo, useRef, useState } from 'react';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { River } from '@/features/rivers/rivers';
import type { Krathong } from '@/types/domain';
import { renderMemoryCard } from './memoryCard';

/** The finished card, with share (where the phone supports sharing a file) and save. */
export function MemoryCardSheet({
  krathong,
  river,
  placeTitle,
  onClose,
}: {
  krathong: Krathong;
  river: River;
  placeTitle?: string | null;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  const fileName = 'loynamkan-memory.jpg';

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useReturnFocus();

  useEffect(() => {
    closeRef.current?.focus();
    let alive = true;
    renderMemoryCard({ krathong, river, placeTitle, host: window.location.host })
      .then((b) => {
        if (alive) setBlob(b);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [krathong, river, placeTitle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = useMemo(() => (blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null), [blob]);
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'ลอยนำกันเด้อ' });
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') setShareNote('แชร์ไม่สำเร็จ ลองกดบันทึกรูปแทนนะ');
    }
  };

  const privateWishLeftOut = krathong.hasWish && !krathong.publicWish;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="memory-title"
      className="lt-rise fixed inset-x-0 bottom-0 z-[210] max-h-[92svh] overflow-y-auto rounded-t-[2rem] border-t border-gold/30 bg-surface/97 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-10px_rgb(0_0_0/0.6)] backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[26rem] sm:rounded-[2rem] sm:border"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="memory-title" className="text-xl font-semibold text-ink">
            การ์ดความทรงจำ
          </h2>
          <p className="mt-1 text-sm text-mist">
            {privateWishLeftOut ? 'คำอธิษฐานของคุณเป็นความลับ จึงไม่ได้ใส่ไว้ในการ์ด' : 'เก็บไว้ดูเอง หรือส่งให้เพื่อนก็ได้'}
          </p>
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

      <div className="mx-auto mt-4 aspect-[4/5] w-full max-w-[18rem] overflow-hidden rounded-2xl bg-night ring-1 ring-ink/10">
        {url ? (
          <img src={url} alt={`การ์ดกระทงของ ${krathong.displayName}`} className="block h-full w-full" />
        ) : failed ? (
          <p className="flex h-full items-center justify-center p-6 text-center text-danger">
            ทำการ์ดไม่สำเร็จ ลองปิดแล้วเปิดใหม่อีกครั้งนะ
          </p>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-mist" role="status">
            <span className="size-3 animate-pulse rounded-full bg-gold shadow-[0_0_24px_6px_rgb(245_199_106/0.5)]" />
            กำลังวาดการ์ด
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {canShare && (
          <Button onClick={share} className="flex-1">
            <Share2 className="size-4" aria-hidden />
            แชร์
          </Button>
        )}
        {url && (
          <a
            href={url}
            download={fileName}
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-6 no-underline ${
              canShare
                ? 'border border-ink/20 bg-night/40 text-ink hover:border-gold/60 hover:text-gold'
                : 'bg-gold font-semibold text-night shadow-[0_8px_30px_-8px_rgb(245_199_106/0.6)] hover:bg-[#ffd788]'
            }`}
          >
            <Download className="size-4" aria-hidden />
            บันทึกรูป
          </a>
        )}
      </div>
      {shareNote && <p className="mt-3 text-sm text-danger">{shareNote}</p>}
    </aside>
  );
}
