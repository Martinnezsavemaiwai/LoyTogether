import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { SoundToggle } from '@/components/common/SoundToggle';
import { FloatingKrathongs } from '@/features/festival/FloatingKrathongs';
import { RiverScene } from '@/features/festival/RiverScene';
import { seededRandom } from '@/features/festival/motion';
import { KrathongSvg } from '@/features/krathong/KrathongSvg';
import { BASES, CANDLES, DECORATIONS, FLOWERS, SHAPES } from '@/features/krathong/options';
import { RIVERS } from '@/features/rivers/rivers';
import type { Krathong } from '@/types/domain';

/** Scenery only: a few krathongs so the river is never empty on the welcome screen. */
function useSceneryKrathongs(): Krathong[] {
  return useMemo(() => {
    const rand = seededRandom(2569);
    const pick = <T,>(list: { value: T }[]) => list[Math.floor(rand() * list.length)]!.value;
    const start = Date.UTC(2026, 10, 24, 12);
    return Array.from({ length: 7 }, (_, i) => ({
      id: `scenery-${i}-${Math.floor(rand() * 1e6)}`,
      roomId: 'scenery',
      ownerId: 'scenery',
      displayName: '',
      krathongName: '',
      design: {
        shape: pick(SHAPES),
        base: pick(BASES),
        flower: pick(FLOWERS),
        candle: pick(CANDLES),
        decoration: pick(DECORATIONS),
      },
      wishVisibility: 'private',
      publicWish: null,
      hasWish: false,
      floatedAt: new Date(start - i * 13_000).toISOString(),
    }));
  }, []);
}

const STEPS = [
  { n: '๑', text: 'เลือกที่ลอย มีทั้งริมเจ้าพระยา สวนลุมพินี สุโขทัย เชียงใหม่ ร้อยเอ็ด และ มทส.' },
  { n: '๒', text: 'ประกอบกระทงเอง เลือกทรง ฐาน ดอกไม้ เทียน และของประดับได้ตามใจ' },
  { n: '๓', text: 'เขียนคำอธิษฐาน จะเก็บไว้คนเดียวหรือให้คนอื่นอ่านด้วยก็ได้' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const scenery = useSceneryKrathongs();

  return (
    <main className="relative">
      <section className="relative h-[100svh] min-h-[560px] overflow-hidden">
        <RiverScene river="wat_arun" className="absolute inset-0 h-full w-full" />
        <div aria-hidden>
          <FloatingKrathongs krathongs={scenery} interactive={false} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[190] h-1/2 bg-gradient-to-t from-night via-night/75 to-transparent" />

        <header className="absolute inset-x-0 top-0 z-[200] flex items-center justify-end p-4 sm:p-6">
          <SoundToggle />
        </header>

        <div className="absolute inset-x-0 bottom-0 z-[200] px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-10 lg:pb-16 lg:pl-[6%]">
          <h1 className="lt-rise text-[clamp(3rem,12vw,6rem)] font-semibold leading-[1.05] tracking-[-0.01em] text-ink">
            ลอยนำกัน<span className="text-gold">เด้อ</span>
          </h1>
          <p
            className="lt-rise mt-3 max-w-[32rem] text-lg text-ink/90 sm:text-xl"
            style={{ '--delay': '0.15s' } as React.CSSProperties}
          >
            คืนวันเพ็ญ 24 พฤศจิกายน 2569 มาลอยกระทงออนไลน์ไปพร้อมกัน
            อยู่ไกลกันแค่ไหนก็ลอยสายน้ำเดียวกันได้
          </p>
          <div
            className="lt-rise mt-8 flex flex-wrap items-center gap-4"
            style={{ '--delay': '0.3s' } as React.CSSProperties}
          >
            <Button onClick={() => navigate('/rivers')} className="px-8 text-lg">
              ไปลอยกระทง
            </Button>
            <span className="text-sm text-mist">ไม่ต้องสมัครสมาชิก</span>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-20 sm:px-10 md:grid-cols-[1fr_1.1fr] md:items-center md:py-28">
        <KrathongSvg
          design={{ shape: 'lotus', base: 'banana_rose', flower: 'lotus', candle: 'golden', decoration: 'jasmine_garland' }}
          className="mx-auto w-full max-w-[22rem]"
          title="กระทงใบตองพับกลีบกุหลาบ ประดับบัวตูมและมาลัยมะลิ"
        />
        <div>
          <h2 className="text-3xl font-semibold leading-snug text-ink [text-wrap:balance] sm:text-4xl">
            ลอยที่ไหน ทุกคนในสายน้ำนั้นก็เห็น
          </h2>
          <p className="mt-5 max-w-[60ch] text-mist">
            กระทงที่คุณลอยจะไปโผล่บนจอของทุกคนที่อยู่สายน้ำเดียวกันทันที
            ลอยคนเดียวก็ได้ หรือเปิดห้องส่วนตัวชวนเพื่อนกับแฟนมาลอยด้วยกันก็ได้
          </p>
          <ol className="mt-8 space-y-4 text-ink">
            {STEPS.map((step) => (
              <li key={step.n} className="flex gap-4">
                <span className="w-6 shrink-0 text-2xl leading-none text-gold">{step.n}</span>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <Button onClick={() => navigate('/rivers')} variant="ghost" className="mt-10">
            ดูที่ลอยทั้ง {RIVERS.length} แห่ง
          </Button>
        </div>
      </section>

      <footer className="border-t border-ink/10 px-6 py-8 text-center text-sm text-mist">
        <p>ลอยนำกันเด้อ เป็นงานลอยกระทงออนไลน์ ไม่ได้เกี่ยวข้องกับผู้จัดงานในสถานที่จริง</p>
      </footer>
    </main>
  );
}
