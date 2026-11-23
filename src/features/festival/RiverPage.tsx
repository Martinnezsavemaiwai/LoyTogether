import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, Heart, Link2, Lock, Plus, Users, Waves } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SongButton } from '@/features/music/SongDock';
import { getRiver, type River } from '@/features/rivers/rivers';
import { inviteUrl, savedInvite } from '@/features/rooms/invite';
import { useRoom } from '@/hooks/useRoom';
import { backend, errorMessage } from '@/lib/backend';
import { useIdentityStore } from '@/stores/identityStore';
import type { Krathong, Room } from '@/types/domain';
import { PaySheet } from '@/features/tips/PaySheet';
import { FloatingKrathongs } from './FloatingKrathongs';
import { KrathongDetails } from './KrathongDetails';
import { RiverScene } from './RiverScene';

const STATUS_LABEL = {
  connecting: 'กำลังเชื่อมต่อ',
  live: 'ออนไลน์',
  offline: 'หลุดการเชื่อมต่อ กำลังต่อใหม่',
} as const;

/** Public river for a venue: /river/:riverId */
export function RiverPage() {
  const { riverId } = useParams();
  const river = getRiver(riverId);
  if (!river) return <Navigate to="/rivers" replace />;
  return <FestivalView key={river.publicRoomId} roomId={river.publicRoomId} river={river} room={null} />;
}

/** Private or couple room: /room/:roomId. Membership is checked by the database. */
export function RoomPage() {
  const { roomId } = useParams();
  const [state, setState] = useState<{ room: Room | null; error: string | null; loading: boolean }>({
    room: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    backend
      .getRoom(roomId)
      .then((room) => {
        if (alive) setState({ room, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (alive) setState({ room: null, error: errorMessage(err), loading: false });
      });
    return () => {
      alive = false;
    };
  }, [roomId]);

  if (state.loading) {
    return (
      <p className="flex min-h-[100svh] items-center justify-center text-mist" role="status">
        กำลังเปิดห้อง
      </p>
    );
  }
  const river = state.room ? getRiver(state.room.riverId) : undefined;
  if (!state.room || !river) {
    return (
      <main className="flex min-h-[100svh] flex-col items-center justify-center gap-4 px-6 text-center">
        <Lock className="size-8 text-gold" aria-hidden />
        <p className="max-w-sm text-ink">
          {state.error ?? 'ห้องนี้เข้าได้เฉพาะคนที่ได้ลิงก์เชิญ หรือห้องปิดไปแล้ว'}
        </p>
        <Link to="/rivers" className="text-gold">
          กลับไปเลือกที่ลอย
        </Link>
      </main>
    );
  }
  return <FestivalView key={state.room.id} roomId={state.room.id} river={river} room={state.room} />;
}

function InviteButton({ roomId }: { roomId: string }) {
  const token = savedInvite(roomId);
  const [copied, setCopied] = useState(false);
  if (!token) return null;
  const copy = async () => {
    const url = inviteUrl(token);
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title: 'มาลอยกระทงนำกันเด้อ', url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Closed the share sheet.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="ส่งลิงก์ชวนเข้าห้อง"
      className="inline-flex size-12 items-center justify-center rounded-full border border-ink/15 bg-night/50 text-ink backdrop-blur-sm hover:border-gold/60 hover:text-gold"
    >
      {copied ? <Check className="size-5" aria-hidden /> : <Link2 className="size-5" aria-hidden />}
    </button>
  );
}

function CoupleMoment({ krathongs }: { krathongs: Krathong[] }) {
  const owners = useMemo(() => {
    const seen = new Map<string, string>();
    for (const k of [...krathongs].reverse()) if (!seen.has(k.ownerId)) seen.set(k.ownerId, k.displayName);
    return [...seen.values()];
  }, [krathongs]);
  const [dismissed, setDismissed] = useState(false);
  if (owners.length < 2 || dismissed) return null;
  return (
    <div className="lt-rise absolute inset-x-0 top-[22%] z-[160] mx-auto w-[min(26rem,90%)] rounded-[2rem] border border-gold/40 bg-night/80 p-6 text-center backdrop-blur-md">
      <Heart className="mx-auto size-7 fill-[#ff8fb1] text-[#ff8fb1]" aria-hidden />
      <p className="mt-3 text-xl font-semibold text-ink">
        {owners[0]} กับ {owners[1]}
      </p>
      <p className="mt-1 text-mist">ลอยกระทงคู่กันแล้ว ขอให้ได้ลอยด้วยกันแบบนี้ทุกปีเด้อ</p>
      <button type="button" onClick={() => setDismissed(true)} className="mt-4 min-h-11 px-4 text-sm text-gold">
        ดูกระทงต่อ
      </button>
    </div>
  );
}

function FestivalView({ roomId, river, room }: { roomId: string; river: River; room: Room | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const identity = useIdentityStore((s) => s.identity);
  const live = useRoom(roomId, identity);
  const [selected, setSelected] = useState<Krathong | null>(null);
  const [justFloated] = useState<Krathong | null>(
    () => (location.state as { justFloated?: Krathong } | null)?.justFloated ?? null,
  );
  const [tip, setTip] = useState<number | null>(
    () => (location.state as { tip?: number | null } | null)?.tip ?? null,
  );
  const [toast, setToast] = useState<string | null>(justFloated ? 'กระทงของคุณลอยไปแล้ว' : null);
  // Let the visitor watch their krathong reach the water before the QR slides up.
  const [payReady, setPayReady] = useState(false);
  useEffect(() => {
    if (tip === null) return;
    const t = window.setTimeout(() => setPayReady(true), 2500);
    return () => window.clearTimeout(t);
  }, [tip]);
  const { addLocal, removeLocal } = live;

  // Show our own krathong right away, before Realtime echoes it back.
  useEffect(() => {
    if (justFloated) {
      addLocal(justFloated);
      navigate(location.pathname, { replace: true, state: null });
    }
    // Runs once for the krathong handed over by the creator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const onReported = useCallback(
    (id: string) => {
      window.setTimeout(() => {
        removeLocal(id);
        setSelected(null);
      }, 1600);
    },
    [removeLocal],
  );
  const closeDetails = useCallback(() => setSelected(null), []);

  const lite = useMemo(
    () => (navigator.hardwareConcurrency ?? 8) <= 4 || window.innerWidth < 480,
    [],
  );
  const visible = lite ? live.krathongs.slice(0, 50) : live.krathongs;
  const title = room ? room.title : river.name;
  const createHref = room ? `/create?room=${room.id}` : `/create?river=${river.id}`;

  return (
    <main className="relative h-[100svh] min-h-[520px] overflow-hidden" data-lite={lite}>
      <RiverScene river={river.id} className="absolute inset-0 h-full w-full" />
      <FloatingKrathongs
        krathongs={visible}
        myId={identity?.userId}
        justFloatedId={justFloated?.id}
        onSelect={setSelected}
      />

      <header className="absolute inset-x-0 top-0 z-[150] flex items-start justify-between gap-3 bg-gradient-to-b from-night/85 to-transparent p-3 sm:p-5">
        <div className="flex min-w-0 items-start gap-2">
          <Link
            to="/rivers"
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-night/55 text-ink backdrop-blur-sm hover:text-gold"
            aria-label="ออกไปเลือกที่ลอยใหม่"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 pt-0.5">
            <h1 className="flex items-center gap-2 truncate text-lg font-semibold leading-tight sm:text-2xl">
              {room && (room.roomType === 'couple' ? <Heart className="size-4 shrink-0 text-[#ff8fb1]" aria-label="ห้องคู่" /> : <Lock className="size-4 shrink-0 text-gold" aria-label="ห้องส่วนตัว" />)}
              <span className="truncate">{title}</span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-mist sm:text-sm">
              {room && <span>{river.name}</span>}
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                อยู่ด้วยกัน {live.presence.toLocaleString('th-TH')} คน
              </span>
              <span className="inline-flex items-center gap-1">
                <Waves className="size-3.5" aria-hidden />
                กระทง {live.krathongs.length.toLocaleString('th-TH')}
                {live.krathongs.length >= 100 ? '+' : ''} ใบ
              </span>
              <span className="inline-flex items-center gap-1.5" role="status">
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${
                    live.status === 'live' ? 'bg-emerald-400' : live.status === 'offline' ? 'bg-danger' : 'animate-pulse bg-gold'
                  }`}
                />
                {STATUS_LABEL[live.status]}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {room && <InviteButton roomId={room.id} />}
          <SongButton />
        </div>
      </header>

      {backend.mode === 'local' && (
        <p className="absolute inset-x-0 bottom-28 z-[140] mx-auto w-fit max-w-[90%] rounded-full bg-violet/20 px-4 py-1.5 text-center text-xs text-ink backdrop-blur-sm">
          โหมดทดลอง ยังไม่ได้ต่อเซิร์ฟเวอร์ กระทงจะเห็นแค่ในเบราว์เซอร์นี้
        </p>
      )}

      {live.loading && live.krathongs.length === 0 && (
        <p className="absolute inset-x-0 top-[62%] z-[120] text-center text-mist" role="status">
          กำลังมองหากระทงบนน้ำ
        </p>
      )}

      {!live.loading && live.error && live.krathongs.length === 0 && (
        <div className="absolute inset-x-0 top-[58%] z-[120] flex flex-col items-center gap-3 px-6 text-center">
          <p className="text-ink">{live.error}</p>
          <Button variant="ghost" onClick={() => void live.refresh()}>
            โหลดใหม่
          </Button>
        </div>
      )}

      {!live.loading && !live.error && live.krathongs.length === 0 && (
        <div className="absolute inset-x-0 top-[58%] z-[120] px-6 text-center">
          <p className="text-2xl font-semibold text-ink">น้ำยังนิ่งอยู่เลย</p>
          <p className="mt-2 text-mist">
            {room ? 'ลอยใบแรกของห้องนี้ได้เลย' : 'ลอยใบแรกของคืนนี้ แล้วทุกคนที่เข้ามาจะเห็นกระทงของคุณ'}
          </p>
        </div>
      )}

      {room?.roomType === 'couple' && <CoupleMoment krathongs={live.krathongs} />}

      <div className="absolute inset-x-0 bottom-0 z-[150] flex justify-center bg-gradient-to-t from-night/85 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
        <Button onClick={() => navigate(createHref)} className="px-8 text-lg">
          <Plus className="size-5" aria-hidden />
          ประกอบกระทงของคุณ
        </Button>
      </div>

      {toast && (
        <p
          role="status"
          className="lt-rise absolute inset-x-0 top-24 z-[160] mx-auto w-fit rounded-full bg-gold px-5 py-2 text-sm font-semibold text-night shadow-lg sm:top-28"
        >
          {toast}
        </p>
      )}

      {tip !== null && payReady && !selected && <PaySheet amount={tip} onClose={() => setTip(null)} />}

      {selected && (
        <KrathongDetails
          key={selected.id}
          krathong={selected}
          isMine={selected.ownerId === identity?.userId}
          onClose={closeDetails}
          onReported={onReported}
        />
      )}
    </main>
  );
}
