import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Eye, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RiverScene } from '@/features/festival/RiverScene';
import { DisplayNameEditor } from '@/features/identity/DisplayNameEditor';
import { getRiver } from '@/features/rivers/rivers';
import type { Room } from '@/types/domain';
import { backend, errorMessage } from '@/lib/backend';
import { charLength, validateWish, WISH_MAX } from '@/lib/validation';
import { useDraftStore } from '@/stores/draftStore';
import { useIdentityStore } from '@/stores/identityStore';
import { KrathongArt } from './KrathongArt';
import { BASES, BEADS, CANDLES, FLOWERS, SHAPES } from './options';
import { ChoicePicker, FlowerPicker, SwitchRow } from './PartPickers';
import { CoinPicker } from '@/features/tips/CoinPicker';

export function CreatePage() {
  const [params] = useSearchParams();
  const roomParam = params.get('room');
  const [room, setRoom] = useState<Room | null | 'loading'>(roomParam ? 'loading' : null);
  const river = getRiver(room && room !== 'loading' ? room.riverId : (params.get('river') ?? undefined));
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomParam) return;
    let alive = true;
    backend
      .getRoom(roomParam)
      .then((r) => {
        if (alive) setRoom(r);
      })
      .catch(() => {
        if (alive) setRoom(null);
      });
    return () => {
      alive = false;
    };
  }, [roomParam]);
  const identity = useIdentityStore((s) => s.identity);
  const draft = useDraftStore();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ wish?: string; submit?: string }>({});
  // One id per attempt: a double tap or retry cannot float two krathongs.
  const attemptId = useRef<string>(crypto.randomUUID());
  const confirmRef = useRef<HTMLDivElement>(null);

  if (room === 'loading') {
    return (
      <p className="flex min-h-[100svh] items-center justify-center text-mist" role="status">
        กำลังเปิดห้อง
      </p>
    );
  }
  if (!river) return <Navigate to="/rivers" replace />;
  const roomId = room ? room.id : river.publicRoomId;
  const backHref = room ? `/room/${room.id}` : `/river/${river.id}`;
  const placeName = room ? room.title : river.name;

  const wishLength = charLength(draft.wish.trim());

  const review = () => {
    const wish = validateWish(draft.wish);
    setErrors({ wish: wish.ok ? undefined : wish.error });
    if (wish.ok) {
      setConfirming(true);
      requestAnimationFrame(() => confirmRef.current?.focus());
    }
  };

  const float = async () => {
    if (!identity || submitting) return;
    const wish = validateWish(draft.wish);
    if (!wish.ok) return;
    setSubmitting(true);
    setErrors({});
    try {
      const krathong = await backend.floatKrathong({
        id: attemptId.current,
        roomId,
        displayName: identity.displayName,
        design: draft.design,
        wish: wish.value,
        visibility: draft.visibility,
      });
      draft.clear();
      draft.setPart('coins', false);
      attemptId.current = crypto.randomUUID();
      navigate(backHref, { state: { justFloated: krathong } });
    } catch (err) {
      setErrors({ submit: errorMessage(err) });
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[100svh] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,32rem)]">
      {/* Live preview on the chosen river */}
      <section
        aria-label="ตัวอย่างกระทง"
        className="sticky top-0 z-10 h-[42svh] overflow-hidden border-b border-ink/10 lg:h-[100svh] lg:border-b-0"
      >
        <RiverScene river={river.id} water="lite" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 sm:p-5">
          <Link
            to={backHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-night/55 px-4 text-sm text-ink no-underline backdrop-blur-sm hover:text-gold"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {placeName}
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-[4%] flex justify-center">
          <div className="lt-bob w-[min(17rem,52vw)] lg:w-[min(30rem,40vw)]">
            <KrathongArt
              design={draft.design}
              className="h-auto w-full drop-shadow-[0_18px_30px_rgb(0_0_0/0.5)]"
              title="ตัวอย่างกระทงของคุณ"
            />
          </div>
        </div>
      </section>

      {/* Builder */}
      <section className="bg-night px-5 pb-28 pt-6 sm:px-8 lg:h-[100svh] lg:overflow-y-auto lg:border-l lg:border-ink/10 lg:pt-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-3xl leading-tight">ประกอบกระทง</h1>
          <button
            type="button"
            onClick={draft.resetDesign}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-mist hover:text-ink"
          >
            <RotateCcw className="size-4" aria-hidden />
            เริ่มแบบใหม่
          </button>
        </div>
        <DisplayNameEditor className="mt-2" />

        <div className="mt-8 space-y-6">
          <ChoicePicker label="ทรงกระทง" name="shape" options={SHAPES} swatches={false} value={draft.design.shape} onChange={(v) => v && draft.setPart('shape', v)} />
          <ChoicePicker label="ฐาน" name="base" options={BASES} value={draft.design.base} onChange={(v) => v && draft.setPart('base', v)} />
          <FlowerPicker options={FLOWERS} value={draft.design.flowers} onToggle={draft.toggleFlower} />
          <ChoicePicker label="เทียน" name="candle" options={CANDLES} value={draft.design.candle} onChange={(v) => draft.setPart('candle', v)} noneLabel="ไม่ใส่" />
          <ChoicePicker label="ลูกปัด" name="beads" options={BEADS} value={draft.design.beads} onChange={(v) => draft.setPart('beads', v)} noneLabel="ไม่ใส่" />
          <div className="space-y-2">
            <SwitchRow label="ธูป 3 ดอก" checked={draft.design.incense} onChange={(v) => draft.setPart('incense', v)} />
            <SwitchRow label="มาลัยมะลิ" hint="ร้อยรอบขอบ มีดอกกุหลาบห้อยด้านหน้า" checked={draft.design.garland} onChange={(v) => draft.setPart('garland', v)} />
          </div>
          <CoinPicker
            value={draft.coinAmount}
            onChange={(coinAmount) => {
              draft.setField({ coinAmount });
              draft.setPart('coins', coinAmount !== null);
            }}
          />
        </div>

        <div className="mt-10 space-y-6 border-t border-ink/10 pt-8">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="wish" className="text-sm text-mist">
                คำอธิษฐาน <span className="text-mist/70">ไม่เขียนก็ได้</span>
              </label>
              <span
                className={`text-xs tabular-nums ${wishLength > WISH_MAX ? 'text-danger' : 'text-mist'}`}
                aria-live="polite"
              >
                {wishLength}/{WISH_MAX}
              </span>
            </div>
            <textarea
              id="wish"
              rows={4}
              value={draft.wish}
              onChange={(e) => {
                draft.setField({ wish: e.target.value });
                setConfirming(false);
              }}
              placeholder="ขอให้"
              aria-invalid={Boolean(errors.wish)}
              aria-describedby={errors.wish ? 'wish-error' : undefined}
              className="w-full resize-none rounded-2xl border border-ink/15 bg-surface px-4 py-3 leading-relaxed text-ink focus:border-gold focus:outline-none"
            />
            {errors.wish && (
              <p id="wish-error" className="mt-1.5 text-sm text-danger">
                {errors.wish}
              </p>
            )}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm text-mist">ใครอ่านคำอธิษฐานได้</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'private', label: 'เก็บเป็นความลับ', hint: 'คุณอ่านได้คนเดียว', Icon: Lock },
                  { value: 'public', label: 'ให้คนอื่นอ่านได้', hint: 'ทุกคนในที่ลอยนี้อ่านได้', Icon: Eye },
                ] as const
              ).map(({ value, label, hint, Icon }) => {
                const selected = draft.visibility === value;
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${
                      selected ? 'border-gold bg-gold/10' : 'border-ink/15 hover:border-ink/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={value}
                      checked={selected}
                      onChange={() => {
                        draft.setField({ visibility: value });
                        setConfirming(false);
                      }}
                      className="sr-only"
                    />
                    <span className="inline-flex items-center gap-2 font-medium text-ink">
                      <Icon className="size-4 text-gold" aria-hidden />
                      {label}
                    </span>
                    <span className="text-xs text-mist">{hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="mt-10">
          {!confirming ? (
            <Button onClick={review} className="w-full text-lg">
              ลอยกระทง
            </Button>
          ) : (
            <div
              ref={confirmRef}
              tabIndex={-1}
              className="rounded-3xl border border-gold/40 bg-surface p-5 focus:outline-none"
              aria-labelledby="confirm-title"
              role="group"
            >
              <p id="confirm-title" className="font-medium text-ink">
                ปล่อยกระทงที่{placeName} เลยไหม
              </p>
              <p className="mt-1 text-sm text-mist">
                {draft.wish.trim()
                  ? draft.visibility === 'private'
                    ? 'คำอธิษฐานเป็นความลับ คนอื่นเห็นแค่กระทง'
                    : 'คำอธิษฐานจะลอยขึ้นเหนือกระทงให้ทุกคนในที่ลอยนี้อ่าน'
                  : 'กระทงใบนี้ไม่มีคำอธิษฐาน'}
                {' '}ลอยไปแล้วแก้ไม่ได้นะ
              </p>
              {errors.submit && (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {errors.submit}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button onClick={float} disabled={submitting} className="flex-1">
                  {submitting ? 'กำลังปล่อยกระทง' : 'ปล่อยลงน้ำเลย'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="flex-1"
                >
                  กลับไปแก้
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
