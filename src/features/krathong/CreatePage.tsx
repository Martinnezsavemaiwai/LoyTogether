import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Check, ChevronDown, Eye, Lock, RotateCcw, Shuffle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RiverScene } from '@/features/festival/RiverScene';
import { getRiver } from '@/features/rivers/rivers';
import type { Room } from '@/types/domain';
import { backend, errorMessage } from '@/lib/backend';
import { charLength, DISPLAY_NAME_MAX, validateDisplayName, validateWish, WISH_MAX } from '@/lib/validation';
import { useDraftStore } from '@/stores/draftStore';
import { useIdentityStore } from '@/stores/identityStore';
import { KrathongArt } from './KrathongArt';
import { BASES, BEADS, CANDLES, FLOWERS, randomDesign, SHAPES } from './options';
import { ChoicePicker, FlowerPicker, SwitchRow, ThumbPicker } from './PartPickers';
import { CoinPicker } from '@/features/tips/CoinPicker';

const STEPS = [
  { id: 'base', label: 'ฐาน', title: 'เลือกทรงกับฐาน', hint: 'เริ่มจากฐานเปล่า แล้วค่อยแต่งในขั้นถัดไป' },
  { id: 'decor', label: 'ตกแต่ง', title: 'แต่งกระทง', hint: 'แตะเพื่อใส่หรือเอาออก กระทงด้านบนเปลี่ยนตามทันที' },
  { id: 'wish', label: 'อธิษฐาน', title: 'อธิษฐานก่อนลอย', hint: 'เขียนสั้นๆ จากใจก็พอ' },
  { id: 'float', label: 'ลอย', title: 'พร้อมปล่อยลงน้ำ', hint: 'ตรวจอีกครั้ง แล้วปล่อยกระทงลงน้ำ' },
] as const;

const DECOR_STEP = 1;
const WISH_STEP = 2;
const FLOAT_STEP = 3;
/** Long enough to watch the krathong settle onto the water, short enough not to wait. */
const RELEASE_MS = 1100;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const rename = useIdentityStore((s) => s.rename);
  // The name is asked for on the last step, prefilled with the guest's current one.
  const [name, setName] = useState<string | null>(null);
  const draft = useDraftStore();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [errors, setErrors] = useState<{ wish?: string; name?: string; submit?: string }>({});
  // One id per attempt: a double tap or retry cannot float two krathongs.
  const attemptId = useRef<string>(crypto.randomUUID());
  const builderRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const movedStep = useRef(false);
  // Steps the visitor has actually been on; a step is ticked only once it is really done.
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  // Shown instead of moving on when the krathong still has nothing on it.
  const [bareNudge, setBareNudge] = useState(false);
  // "เริ่มใหม่" wipes every part, so the last look can be brought back for a moment.
  const [undoDesign, setUndoDesign] = useState<typeof draft.design | null>(null);
  useEffect(() => {
    if (!undoDesign) return;
    const t = window.setTimeout(() => setUndoDesign(null), 8000);
    return () => window.clearTimeout(t);
  }, [undoDesign]);

  // Each step starts at its top, and focus follows so screen readers hear the new step.
  useEffect(() => {
    if (!movedStep.current) return;
    builderRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

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
  const extrasOn = [draft.design.beads !== null, draft.design.garland, draft.design.coins, !!draft.design.money].filter(
    Boolean,
  ).length;
  // Nothing a visitor would call decoration yet: no candle, flowers, incense or extras.
  const isBare =
    !draft.design.candle && draft.design.flowers.length === 0 && !draft.design.incense && extrasOn === 0;
  const isDone = (i: number) => i !== step && visited.has(i) && (i !== DECOR_STEP || !isBare);

  const goTo = (next: number) => {
    if (submitting || next === step) return;
    setBareNudge(false);
    if (next >= FLOAT_STEP) {
      const wish = validateWish(draft.wish);
      setErrors({ wish: wish.ok ? undefined : wish.error });
      if (!wish.ok) {
        movedStep.current = true;
        setVisited((v) => new Set(v).add(step).add(WISH_STEP));
        setStep(WISH_STEP);
        return;
      }
    }
    movedStep.current = true;
    setVisited((v) => new Set(v).add(step).add(next));
    setStep(next);
  };

  // The forward button on the decor step asks once before a bare krathong moves on.
  const forward = () => {
    if (step === DECOR_STEP && isBare && !bareNudge) {
      setBareNudge(true);
      return;
    }
    goTo(step + 1);
  };

  const reset = () => {
    setUndoDesign(draft.design);
    draft.resetDesign();
  };

  const float = async () => {
    if (!identity || submitting) return;
    const wish = validateWish(draft.wish);
    if (!wish.ok) {
      goTo(WISH_STEP);
      return;
    }
    const nameCheck = validateDisplayName(name ?? identity.displayName);
    if (!nameCheck.ok) {
      setErrors({ name: nameCheck.error });
      return;
    }
    setSubmitting(true);
    setErrors({});
    if (nameCheck.value !== identity.displayName) {
      try {
        await rename(nameCheck.value);
      } catch (err) {
        setErrors({ name: errorMessage(err) });
        setSubmitting(false);
        return;
      }
    }
    setReleasing(true);
    navigator.vibrate?.(30);
    const settle = new Promise((resolve) => window.setTimeout(resolve, prefersReducedMotion() ? 0 : RELEASE_MS));
    try {
      const [krathong] = await Promise.all([
        backend.floatKrathong({
          id: attemptId.current,
          roomId,
          displayName: nameCheck.value,
          design: draft.design,
          wish: wish.value,
          visibility: draft.visibility,
        }),
        settle,
      ]);
      draft.clear();
      attemptId.current = crypto.randomUUID();
      navigate(backHref, { state: { justFloated: krathong } });
    } catch (err) {
      setReleasing(false);
      setErrors({ submit: errorMessage(err) });
      setSubmitting(false);
    }
  };

  const current = STEPS[step]!;
  const next = STEPS[step + 1];
  const wishText = draft.wish.trim();
  // Writing needs room more than a big preview, so it steps back on a phone while the
  // wish is typed; on the float step the krathong is the moment, so it comes back full.
  const compact = step === WISH_STEP;
  // A bare krathong would draw every shape as the same flat plate, so the shape cards
  // show a candle and a flower to make the outlines readable.
  const showcase = isBare ? { ...draft.design, flowers: ['marigold' as const], candle: 'golden' as const } : draft.design;
  const wishLeft = WISH_MAX - wishLength;

  return (
    <main className="min-h-[100svh] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,32rem)]">
      {/* Live preview on the chosen river */}
      <section
        aria-label="ตัวอย่างกระทง"
        className={`sticky top-0 z-10 overflow-hidden border-b border-ink/10 transition-[height] duration-500 ease-[var(--ease-out-expo)] motion-reduce:transition-none lg:h-[100svh] lg:transition-none lg:border-b-0 ${
          compact ? 'h-[24svh] sm:h-[30svh]' : 'h-[38svh] sm:h-[42svh]'
        }`}
      >
        <RiverScene river={river.id} water="lite" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 sm:p-5">
          <Link
            to={backHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-night/60 px-4 text-sm text-ink no-underline backdrop-blur-sm hover:text-gold"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {placeName}
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-[4%] flex justify-center">
          <div
            className={`${releasing ? 'lt-launch' : 'lt-bob'} transition-[width] duration-500 motion-reduce:transition-none lg:w-[min(30rem,40vw)] ${
              compact ? 'w-[min(10rem,36vw)]' : 'w-[min(17rem,56vw)]'
            }`}
          >
            <KrathongArt
              design={draft.design}
              className="h-auto w-full drop-shadow-[0_18px_30px_rgb(0_0_0/0.5)]"
              title="ตัวอย่างกระทงของคุณ"
              ghostCandle
            />
          </div>
          {releasing && <span aria-hidden className="lt-ripple absolute bottom-[6%] h-6 w-40 rounded-[50%] border border-gold/60" />}
        </div>
      </section>

      {/* Builder, one step at a time */}
      <section
        ref={builderRef}
        className="flex min-h-[62svh] flex-col bg-night sm:min-h-[58svh] lg:h-[100svh] lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-ink/10"
      >
        <div className="flex-1 px-5 pt-5 sm:px-8 lg:pt-10">
          <div className="flex items-center justify-between gap-3">
            <h1 className={step >= WISH_STEP ? 'sr-only' : 'text-2xl font-semibold leading-tight'}>ประกอบกระทง</h1>
            {step < WISH_STEP && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => draft.setDesign(randomDesign())}
                disabled={submitting}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-gold hover:bg-gold/10"
              >
                <Shuffle className="size-4" aria-hidden />
                สุ่มให้
              </button>
              {undoDesign ? (
                <button
                  type="button"
                  onClick={() => {
                    draft.setDesign(undoDesign);
                    setUndoDesign(null);
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink/20 px-3 text-sm text-ink hover:border-gold/60"
                >
                  <Undo2 className="size-4" aria-hidden />
                  ย้อนคืน
                </button>
              ) : (
                <button
                  type="button"
                  onClick={reset}
                  disabled={submitting || isBare}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-mist hover:text-ink disabled:opacity-40"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  เริ่มใหม่
                </button>
              )}
            </div>
            )}
          </div>

          <nav aria-label="ขั้นตอนประกอบกระทง" className="mt-5">
            <ol className="grid grid-cols-4 gap-1.5">
              {STEPS.map((s, i) => {
                const done = isDone(i);
                const active = i === step;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={active ? 'step' : undefined}
                      disabled={submitting}
                      className={`group flex min-h-11 w-full flex-col items-center gap-1.5 rounded-xl pt-1 text-sm transition-colors ${
                        active ? 'text-ink' : done ? 'text-ink/80 hover:text-ink' : 'text-mist hover:text-ink'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-1 w-full rounded-full transition-colors ${active ? 'bg-gold' : done ? 'bg-gold/45' : 'bg-ink/15'}`}
                      />
                      <span className="inline-flex items-center gap-1">
                        {done && <Check className="size-3.5 text-gold" aria-hidden />}
                        {s.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="pb-8 pt-6">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
              {current.title}
            </h2>
            <p className="mb-5 mt-1 text-sm text-mist">
              {current.id === 'decor' && isBare ? 'กระทงยังโล่งอยู่ เริ่มจากจุดเทียนแล้วเติมดอกไม้ได้เลย' : current.hint}
            </p>

            {current.id === 'base' && (
              <div className="space-y-7">
                <ThumbPicker
                  label="ทรงกระทง"
                  name="shape"
                  options={SHAPES}
                  value={draft.design.shape}
                  onChange={(v) => draft.setPart('shape', v)}
                  preview={(shape) => ({ ...showcase, shape })}
                />
                <ThumbPicker
                  label="ฐาน"
                  name="base"
                  options={BASES}
                  value={draft.design.base}
                  onChange={(v) => draft.setPart('base', v)}
                  preview={(base) => ({ ...showcase, base })}
                />
              </div>
            )}

            {current.id === 'decor' && (
              <div className="space-y-7">
                <ChoicePicker
                  label="เทียน"
                  name="candle"
                  options={CANDLES}
                  value={draft.design.candle}
                  onChange={(v) => draft.setPart('candle', v)}
                  noneLabel="ไม่ใส่"
                />
                <SwitchRow label="ธูป 3 ดอก" checked={draft.design.incense} onChange={(v) => draft.setPart('incense', v)} />
                <FlowerPicker options={FLOWERS} value={draft.design.flowers} onToggle={draft.toggleFlower} />
                <details className="group rounded-2xl border border-ink/12 bg-surface/40 open:bg-surface/60">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="block font-medium text-ink">ของประดับเพิ่ม</span>
                      <span className="block text-sm text-mist">
                        ลูกปัด มาลัย เงิน{extrasOn > 0 ? ` ใส่อยู่ ${extrasOn} อย่าง` : ''}
                      </span>
                    </span>
                    <ChevronDown className="size-5 shrink-0 text-mist transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-6 px-4 pb-5 pt-2">
                    <ChoicePicker
                      label="ลูกปัด"
                      name="beads"
                      options={BEADS}
                      value={draft.design.beads}
                      onChange={(v) => draft.setPart('beads', v)}
                      noneLabel="ไม่ใส่"
                    />
                    <div className="space-y-2">
                      <SwitchRow
                        label="มาลัยมะลิ"
                        hint="ร้อยรอบขอบ มีดอกกุหลาบห้อยด้านหน้า"
                        checked={draft.design.garland}
                        onChange={(v) => draft.setPart('garland', v)}
                      />
                    </div>
                    <CoinPicker
                      money={draft.design.money}
                      onMoneyChange={draft.setMoney}
                    />
                  </div>
                </details>
              </div>
            )}

            {current.id === 'wish' && (
              <div className="space-y-7">
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <label htmlFor="wish" className="font-medium text-ink">
                      คำอธิษฐาน <span className="text-sm font-normal text-mist">ไม่เขียนก็ได้</span>
                    </label>
                    <span
                      aria-hidden
                      className={`text-sm tabular-nums ${wishLength > WISH_MAX ? 'text-danger' : 'text-mist'}`}
                    >
                      {wishLength}/{WISH_MAX}
                    </span>
                    {/* Screen readers hear the count only near the limit, not on every keystroke. */}
                    <span className="sr-only" aria-live="polite">
                      {wishLeft < 0
                        ? `ยาวเกินไป ${-wishLeft} ตัวอักษร`
                        : wishLeft <= 20
                          ? `เหลืออีก ${wishLeft} ตัวอักษร`
                          : ''}
                    </span>
                  </div>
                  <textarea
                    id="wish"
                    rows={5}
                    value={draft.wish}
                    onChange={(e) => {
                      draft.setField({ wish: e.target.value });
                      if (errors.wish) setErrors({});
                    }}
                    placeholder="ขอให้"
                    aria-invalid={Boolean(errors.wish)}
                    aria-describedby={errors.wish ? 'wish-error' : undefined}
                    className="w-full resize-none rounded-2xl border border-ink/15 bg-surface px-4 py-3 text-base leading-relaxed text-ink focus:border-gold focus:outline-none"
                  />
                  {errors.wish && (
                    <p id="wish-error" className="mt-1.5 text-sm text-danger" role="alert">
                      {errors.wish}
                    </p>
                  )}
                </div>

                <fieldset>
                  <legend className="mb-3 font-medium text-ink">ใครอ่านคำอธิษฐานได้</legend>
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
                          className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${
                            selected ? 'border-gold bg-gold/10' : 'border-ink/15 hover:border-ink/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name="visibility"
                            value={value}
                            checked={selected}
                            onChange={() => draft.setField({ visibility: value })}
                            className="sr-only"
                          />
                          <span className="inline-flex items-center gap-2 font-medium text-ink">
                            <Icon className="size-4 text-gold" aria-hidden />
                            {label}
                          </span>
                          <span className="text-sm text-mist">{hint}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            )}

            {current.id === 'float' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="float-name" className="font-medium text-ink">
                    ลอยในนามใคร
                  </label>
                  <p id="float-name-hint" className="mt-0.5 text-sm text-mist">
                    ชื่อนี้จะขึ้นบนป้ายกระทงและการ์ดความทรงจำ
                  </p>
                  <input
                    id="float-name"
                    value={name ?? identity?.displayName ?? ''}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({});
                    }}
                    maxLength={DISPLAY_NAME_MAX + 4}
                    autoComplete="nickname"
                    enterKeyHint="done"
                    disabled={submitting}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'float-name-hint float-name-error' : 'float-name-hint'}
                    className="mt-2 h-12 w-full rounded-2xl border border-ink/15 bg-surface px-4 text-base text-ink focus:border-gold focus:outline-none"
                  />
                  {errors.name && (
                    <p id="float-name-error" className="mt-1.5 text-sm text-danger" role="alert">
                      {errors.name}
                    </p>
                  )}
                </div>
                <p className="text-ink/90">
                  กระทงจะลอยที่{placeName}{' '}
                  {room ? 'ทุกคนในห้องนี้จะเห็นกระทงของคุณ' : 'ทุกคนที่อยู่ที่นี่ตอนนี้จะเห็นกระทงของคุณลอยไปด้วยกัน'}
                </p>
                <div className="rounded-2xl border border-ink/12 bg-surface/60 p-4">
                  {wishText ? (
                    <>
                      <p className="flex items-center gap-2 text-sm text-mist">
                        {draft.visibility === 'private' ? (
                          <>
                            <Lock className="size-4 text-gold" aria-hidden /> คำอธิษฐานเป็นความลับ คนอื่นเห็นแค่กระทง
                          </>
                        ) : (
                          <>
                            <Eye className="size-4 text-gold" aria-hidden /> คำอธิษฐานจะลอยขึ้นเหนือกระทงให้ทุกคนอ่าน
                          </>
                        )}
                      </p>
                      <p className="mt-2 line-clamp-4 break-words leading-relaxed text-ink">“{wishText}”</p>
                    </>
                  ) : (
                    <p className="text-sm text-mist">กระทงใบนี้ไม่มีคำอธิษฐาน</p>
                  )}
                  <button
                    type="button"
                    onClick={() => goTo(WISH_STEP)}
                    disabled={submitting}
                    className="mt-2 min-h-11 text-sm text-gold underline decoration-gold/40 underline-offset-4"
                  >
                    {wishText ? 'แก้คำอธิษฐาน' : 'เขียนคำอธิษฐาน'}
                  </button>
                </div>
                <p className="text-sm text-mist">ลอยไปแล้วแก้ไม่ได้นะ</p>
                {errors.submit && (
                  <p className="text-sm text-danger" role="alert">
                    {errors.submit}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Thumb-reach controls: always at the bottom of the screen, whatever the step. */}
        <div className="sticky bottom-0 z-20 border-t border-ink/10 bg-night/92 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-8">
          {bareNudge && (
            <div role="status" className="mb-3 rounded-2xl border border-gold/30 bg-surface p-4">
              <p className="font-medium text-ink">กระทงยังไม่มีเทียนกับดอกไม้เลยนะ</p>
              <p className="mt-0.5 text-sm text-mist">ลอยแบบเรียบๆ ก็ได้ หรือให้ช่วยแต่งให้ก่อนก็ได้</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    draft.setDesign({ ...randomDesign(), shape: draft.design.shape, base: draft.design.base });
                    setBareNudge(false);
                  }}
                  className="flex-1"
                >
                  <Shuffle className="size-4" aria-hidden />
                  สุ่มแต่งให้
                </Button>
                <Button variant="ghost" onClick={() => goTo(step + 1)} className="flex-1">
                  ลอยแบบเรียบๆ
                </Button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={submitting} className="px-5">
                ย้อนกลับ
              </Button>
            )}
            {step < FLOAT_STEP ? (
              <Button onClick={forward} className="flex-1">
                {step === WISH_STEP ? 'พร้อมลอยแล้ว' : `ถัดไป ${next?.label ?? ''}`}
              </Button>
            ) : (
              <Button onClick={float} disabled={submitting} className="flex-1 text-lg">
                {submitting ? 'กำลังปล่อยกระทง' : 'ปล่อยลงน้ำเลย'}
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
