import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, Heart, Link2, Users, X } from 'lucide-react';
import { getRiver } from '@/features/rivers/rivers';
import { backend } from '@/lib/backend';
import { inviteUrl, savedInvite } from './invite';
import type { Room } from '@/types/domain';

function timeLeft(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const hours = Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000));
  if (hours < 1) return 'ใกล้ปิดแล้ว';
  if (hours < 24) return `ปิดในอีก ${hours} ชั่วโมง`;
  return `ปิดในอีก ${Math.ceil(hours / 24)} วัน`;
}

/**
 * Rooms this guest opened or joined. Guests are tied to this browser, so a room made on
 * another phone or after clearing site data will not show here; the invite link still works.
 */
export function MyRooms({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    backend
      .listMyRooms()
      .then((r) => {
        if (alive) setRooms(r);
      })
      .catch(() => {
        if (alive) setRooms([]);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey, reload]);

  if (!rooms || rooms.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold">ห้องของคุณ</h2>
      <p className="mt-1 text-sm text-mist">ห้องที่คุณเปิดหรือเข้าร่วมจากเครื่องนี้</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {rooms.map((room) => (
          <RoomItem key={room.id} room={room} onClosed={() => setReload((v) => v + 1)} />
        ))}
      </ul>
    </div>
  );
}

function RoomItem({ room, onClosed }: { room: Room; onClosed: () => void }) {
  const [mode, setMode] = useState<'idle' | 'confirm' | 'closing'>('idle');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = room.roomType === 'couple' ? Heart : Users;
  const token = room.isOwner ? savedInvite(room.id) : null;

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('คัดลอกไม่สำเร็จ ลองเข้าห้องแล้วกดปุ่มชวนแทนนะ');
    }
  };

  const close = async () => {
    setMode('closing');
    setError(null);
    try {
      await backend.closeRoom(room.id);
      onClosed();
    } catch {
      setError('ปิดห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ');
      setMode('idle');
    }
  };

  const action = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm';

  return (
    <li className="rounded-2xl border border-ink/10 bg-surface/70">
      <Link
        to={`/room/${room.id}`}
        className="group flex min-h-16 items-center gap-4 px-4 py-3 text-ink no-underline transition-colors hover:text-gold"
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-violet/12 text-violet">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{room.title}</span>
          <span className="block truncate text-sm text-mist">
            {room.roomType === 'couple' ? 'ห้องคู่' : 'ห้องเพื่อน'} ที่{getRiver(room.riverId)?.name ?? ''}{' '}
            <span className="text-mist/80">{timeLeft(room.expiresAt)}</span>
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-mist transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
      {room.isOwner && (
        <div className="flex flex-wrap items-center gap-1 border-t border-ink/10 px-2 py-1.5">
          {mode === 'idle' && (
            <>
              {token && (
                <button type="button" onClick={copy} className={`${action} text-gold hover:bg-gold/10`}>
                  {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์ชวน'}
                </button>
              )}
              <button type="button" onClick={() => setMode('confirm')} className={`${action} ml-auto text-mist hover:bg-danger/10 hover:text-danger`}>
                <X className="size-4" aria-hidden />
                ปิดห้อง
              </button>
            </>
          )}
          {mode !== 'idle' && (
            <div className="flex w-full flex-wrap items-center gap-2 px-2 py-1">
              <span className="text-sm text-ink">ปิดห้องนี้เลยไหม ลิงก์ชวนจะใช้ไม่ได้และเปิดคืนไม่ได้</span>
              <button
                type="button"
                onClick={close}
                disabled={mode === 'closing'}
                className={`${action} bg-danger/20 text-danger hover:bg-danger/30 disabled:opacity-60`}
              >
                {mode === 'closing' ? 'กำลังปิด' : 'ปิดห้อง'}
              </button>
              <button type="button" onClick={() => setMode('idle')} className={`${action} text-mist hover:text-ink`}>
                ยกเลิก
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="px-4 pb-3 text-sm text-danger">{error}</p>}
    </li>
  );
}
