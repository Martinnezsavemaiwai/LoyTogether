import { useEffect, useRef, useState } from 'react';
import { Flag, Lock, X } from 'lucide-react';
import { KrathongArt } from '@/features/krathong/KrathongArt';
import { backend, errorMessage } from '@/lib/backend';
import type { Krathong } from '@/types/domain';

interface Props {
  krathong: Krathong;
  isMine: boolean;
  onClose: () => void;
  onReported: (id: string) => void;
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `เมื่อ ${minutes} นาทีก่อน`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `เมื่อ ${hours} ชั่วโมงก่อน`;
  return `วันที่ ${new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`;
}

/** Non-modal panel: the river keeps moving behind it. */
export function KrathongDetails({ krathong, isMine, onClose, onReported }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [myWish, setMyWish] = useState<string | null>(null);
  const [reportState, setReportState] = useState<'idle' | 'confirm' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (isMine && krathong.hasWish && krathong.wishVisibility === 'private') {
      let alive = true;
      backend
        .fetchMyPrivateWish(krathong.id)
        .then((w) => {
          if (alive) setMyWish(w);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }
  }, [krathong, isMine]);

  const report = async () => {
    setReportState('sending');
    try {
      await backend.reportKrathong(krathong.id);
      setReportState('done');
      onReported(krathong.id);
    } catch (err) {
      setError(errorMessage(err));
      setReportState('idle');
    }
  };

  let wishBlock: React.ReactNode;
  if (krathong.publicWish) {
    wishBlock = (
      <blockquote className="whitespace-pre-line break-words text-lg leading-relaxed text-ink">
        “{krathong.publicWish}”
      </blockquote>
    );
  } else if (isMine && myWish) {
    wishBlock = (
      <div>
        <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-gold">
          <Lock className="size-3.5" aria-hidden /> เห็นแค่คุณคนเดียว
        </p>
        <p className="whitespace-pre-line break-words text-ink">{myWish}</p>
      </div>
    );
  } else if (krathong.hasWish) {
    wishBlock = (
      <p className="inline-flex items-center gap-2 text-mist">
        <Lock className="size-4" aria-hidden /> เจ้าของเก็บคำอธิษฐานนี้ไว้เป็นความลับ
      </p>
    );
  } else {
    wishBlock = <p className="text-mist">กระทงใบนี้ไม่ได้ฝากคำอธิษฐานไว้</p>;
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="krathong-detail-title"
      className="lt-rise fixed inset-x-0 bottom-0 z-[200] max-h-[70svh] overflow-y-auto rounded-t-[2rem] border-t border-ink/15 bg-surface/95 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-10px_rgb(0_0_0/0.6)] backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[24rem] sm:rounded-[2rem] sm:border"
    >
      <div className="flex items-start gap-4">
        <KrathongArt design={krathong.design} lit={false} className="w-24 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="krathong-detail-title" className="break-words text-xl font-semibold text-ink">
            {krathong.krathongName}
          </h2>
          <p className="mt-0.5 break-words text-sm text-mist">
            {krathong.displayName} ลอยไว้{timeAgo(krathong.floatedAt)}
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

      <div className="mt-5">{wishBlock}</div>

      {!isMine && krathong.publicWish && (
        <div className="mt-6 border-t border-ink/10 pt-4 text-sm">
          {reportState === 'idle' && (
            <button
              type="button"
              onClick={() => setReportState('confirm')}
              className="inline-flex min-h-11 items-center gap-2 text-mist hover:text-danger"
            >
              <Flag className="size-4" aria-hidden /> รายงานข้อความไม่เหมาะสม
            </button>
          )}
          {reportState === 'confirm' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink">รายงานกระทงใบนี้?</span>
              <button
                type="button"
                onClick={report}
                className="min-h-11 rounded-full bg-danger/20 px-4 text-danger hover:bg-danger/30"
              >
                รายงาน
              </button>
              <button
                type="button"
                onClick={() => setReportState('idle')}
                className="min-h-11 rounded-full px-4 text-mist hover:text-ink"
              >
                ยกเลิก
              </button>
            </div>
          )}
          {reportState === 'sending' && <span className="text-mist">กำลังส่ง</span>}
          {reportState === 'done' && (
            <span className="text-mist">ขอบคุณที่ช่วยดูแลนะ ซ่อนกระทงนี้จากจอของคุณแล้ว</span>
          )}
          {error && <p className="mt-2 text-danger">{error}</p>}
        </div>
      )}
    </aside>
  );
}
