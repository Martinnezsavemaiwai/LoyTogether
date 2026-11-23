import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarDays, MapPin, Users, Waves } from 'lucide-react';
import { SongButton, useSongStore } from '@/features/music/SongDock';
import { Wordmark } from '@/components/layout/Wordmark';
import { RiverScene } from '@/features/festival/RiverScene';
import { DisplayNameEditor } from '@/features/identity/DisplayNameEditor';
import { CreateRoomPanel } from '@/features/rooms/CreateRoomPanel';
import { backend } from '@/lib/backend';
import { RIVERS } from './rivers';

export function RiversPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [presence, setPresence] = useState<Record<string, number> | null>(null);
  const startSong = useSongStore((s) => s.start);

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
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2">
          <DisplayNameEditor />
          <SongButton />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-6 sm:px-8 sm:pt-10">
        <h1 className="text-4xl font-semibold leading-tight [text-wrap:balance] sm:text-5xl">
          คืนนี้ลอยที่ไหนดี
        </h1>
        <p className="mt-3 max-w-[60ch] text-mist">
          ทุกที่จำลองมาจากสถานที่ที่มีงานลอยกระทงจริงปีนี้ คนที่เลือกที่เดียวกันจะเห็นกระทงของกันและกัน
        </p>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-lite="true">
          {RIVERS.map((river, i) => {
            const online = presence?.[river.publicRoomId];
            const count = stats?.[river.publicRoomId];
            return (
              <li key={river.id} className="lt-rise" style={{ '--delay': `${0.05 + i * 0.07}s` } as React.CSSProperties}>
                <Link
                  to={`/river/${river.id}`}
                  onClick={startSong}
                  className="group relative flex h-[24rem] flex-col justify-end overflow-hidden rounded-[2rem] text-ink no-underline ring-1 ring-ink/10 transition-[box-shadow,transform] duration-500 hover:-translate-y-1 hover:shadow-[0_24px_60px_-20px_rgb(245_199_106/0.35)] hover:ring-gold/50 lg:h-[28rem]"
                >
                  <RiverScene
                    river={river.id}
                    size="sm"
                    className="absolute inset-0 h-full w-full transition-transform duration-[1200ms] group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-night via-night/60 to-transparent" />
                  <div className="relative p-6">
                    <p className="inline-flex items-center gap-1.5 text-sm text-gold">
                      <MapPin className="size-3.5" aria-hidden />
                      {river.region}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">{river.name}</h2>
                    <p className="mt-2 text-sm text-ink/80">{river.description}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-mist">
                      {online !== undefined && (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="size-4" aria-hidden />
                          อยู่ตอนนี้ {online.toLocaleString('th-TH')} คน
                        </span>
                      )}
                      {count !== undefined && (
                        <span className="inline-flex items-center gap-1.5">
                          <Waves className="size-4" aria-hidden />
                          กระทง {count.toLocaleString('th-TH')} ใบ
                        </span>
                      )}
                    </div>
                    <span className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-gold px-6 font-semibold text-night">
                      ไปลอยที่นี่
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                    </span>
                  </div>
                </Link>
                {river.realEvent && (
                  <p className="mt-3 flex gap-2 px-2 text-xs leading-relaxed text-mist">
                    <CalendarDays className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{river.realEvent}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-6 px-2 text-xs text-mist">
          ข้อมูลงานจริงรวบรวมจากข่าว ณ วันที่ 23 พ.ย. 2569 ถ้าจะไปงานจริงเช็กกับผู้จัดอีกครั้งนะ
          ลอยนำกันเด้อไม่ได้เป็นผู้จัดงานในสถานที่เหล่านี้
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <CreateRoomPanel />
      </section>
    </main>
  );
}
