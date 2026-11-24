import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarDays, ChevronDown, Heart, MapPin, Users, Waves } from 'lucide-react';
import { SongButton, useSongStore } from '@/features/music/SongDock';
import { Wordmark } from '@/components/layout/Wordmark';
import { RiverScene } from '@/features/festival/RiverScene';
import { DisplayNameEditor } from '@/features/identity/DisplayNameEditor';
import { CreateRoomPanel } from '@/features/rooms/CreateRoomPanel';
import { MyRooms } from '@/features/rooms/MyRooms';
import { backend } from '@/lib/backend';
import { RIVERS } from './rivers';

const num = (n: number) => n.toLocaleString('th-TH');

export function RiversPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [presence, setPresence] = useState<Record<string, number> | null>(null);
  const startSong = useSongStore((s) => s.start);
  const [roomsVersion, setRoomsVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    backend
      .fetchRiverStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {
        if (alive) setStats({});
      });
    const stop = backend.watchPresence(
      RIVERS.map((r) => r.publicRoomId),
      setPresence,
    );
    return () => {
      alive = false;
      stop();
    };
  }, []);

  return (
    <main className="min-h-[100svh] bg-[radial-gradient(ellipse_at_top,#1a1f45_0%,#090d1c_60%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4">
        <Wordmark />
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {/* The builder shows the name too; on a phone the header keeps to logo and sound. */}
          <div className="hidden sm:block">
            <DisplayNameEditor />
          </div>
          <SongButton />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-4 sm:px-8 sm:pt-8">
        <h1 className="text-3xl font-semibold leading-tight [text-wrap:balance] sm:text-5xl">คืนนี้ลอยกับใครดี</h1>

        {/* Who first, then where: the couple and friend rooms are a reason to come, not a footnote. */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-2xl">
          <a
            href="#venues"
            className="group flex min-h-24 flex-col justify-between gap-2 rounded-3xl border border-gold/50 bg-gold/10 p-4 text-ink no-underline transition-colors hover:bg-gold/15 sm:p-5"
          >
            <Users className="size-5 text-gold" aria-hidden />
            <span>
              <span className="block font-semibold">ลอยกับทุกคน</span>
              <span className="block text-sm text-ink/75">เลือกที่ลอยด้านล่าง</span>
            </span>
          </a>
          <a
            href="#rooms"
            className="group flex min-h-24 flex-col justify-between gap-2 rounded-3xl border border-violet/40 bg-violet/10 p-4 text-ink no-underline transition-colors hover:bg-violet/15 sm:p-5"
          >
            <Heart className="size-5 text-violet" aria-hidden />
            <span>
              <span className="block font-semibold">ลอยกับแฟนหรือเพื่อน</span>
              <span className="block text-sm text-ink/75">เปิดห้องแล้วส่งลิงก์ชวน</span>
            </span>
          </a>
        </div>

        <div id="venues" className="scroll-mt-4 pt-10">
          <h2 className="text-xl font-semibold sm:text-2xl">เลือกที่ลอย</h2>
          <p className="mt-1.5 max-w-[60ch] text-mist">
            จำลองจากที่ที่มีงานลอยกระทงจริงปีนี้ คนที่เลือกที่เดียวกันจะเห็นกระทงของกันและกัน
          </p>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" data-lite="true">
            {RIVERS.map((river, i) => {
              const online = presence?.[river.publicRoomId] ?? 0;
              const count = stats?.[river.publicRoomId] ?? 0;
              return (
                <li key={river.id} className="lt-rise" style={{ '--delay': `${0.04 + i * 0.05}s` } as React.CSSProperties}>
                  <Link
                    to={`/river/${river.id}`}
                    onClick={startSong}
                    className="group relative flex h-40 flex-col justify-end overflow-hidden rounded-3xl text-ink no-underline ring-1 ring-ink/10 transition-[box-shadow] duration-300 hover:ring-gold/60 sm:h-56 lg:h-64"
                  >
                    <RiverScene
                      river={river.id}
                      size="sm"
                      className="absolute inset-0 h-full w-full transition-transform duration-[1200ms] group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-transparent" />
                    <div className="relative flex items-end justify-between gap-3 p-4 sm:p-5">
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1 text-sm text-gold">
                          <MapPin className="size-3.5" aria-hidden />
                          {river.region}
                        </p>
                        <h3 className="mt-0.5 text-lg font-semibold leading-snug sm:text-xl">{river.name}</h3>
                        <p className="mt-1 hidden text-sm text-ink/80 sm:line-clamp-2">{river.description}</p>
                        {(online > 0 || count > 0) && (
                          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink/80">
                            {online > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="size-3.5" aria-hidden />
                                อยู่ตอนนี้ <span className="font-display">{num(online)}</span> คน
                              </span>
                            )}
                            {count > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Waves className="size-3.5" aria-hidden />
                                ลอยแล้ว <span className="font-display">{num(count)}</span> ใบ
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <span
                        aria-hidden
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-night/60 text-gold ring-1 ring-gold/40 backdrop-blur-sm transition-colors group-hover:bg-gold group-hover:text-night"
                      >
                        <ArrowRight className="size-5" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <details className="group mt-5 rounded-2xl border border-ink/10 bg-surface/40">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-ink [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4 text-gold" aria-hidden />
                งานลอยกระทงจริงปีนี้ในที่เหล่านี้
              </span>
              <ChevronDown className="size-5 shrink-0 text-mist transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="px-4 pb-4">
              <ul className="space-y-3">
                {RIVERS.filter((r) => r.realEvent).map((r) => (
                  <li key={r.id} className="text-sm leading-relaxed">
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="block text-mist">{r.realEvent}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-ink/10 pt-3 text-sm text-mist">
                รวบรวมจากข่าว ณ วันที่ 23 พ.ย. 2569 ถ้าจะไปงานจริงเช็กกับผู้จัดอีกครั้งนะ
                ลอยนำกันเด้อไม่ได้เป็นผู้จัดงานในสถานที่เหล่านี้
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="rooms" className="mx-auto max-w-6xl scroll-mt-4 px-5 pb-20 sm:px-8">
        <MyRooms refreshKey={roomsVersion} />
        <CreateRoomPanel onCreated={() => setRoomsVersion((v) => v + 1)} />
      </section>
    </main>
  );
}
