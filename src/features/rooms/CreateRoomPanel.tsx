import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Check, Copy, Heart, Share2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RIVERS } from '@/features/rivers/rivers';
import { backend, errorMessage } from '@/lib/backend';
import { cleanText, charLength } from '@/lib/validation';
import { containsBlockedWords } from '@/lib/moderation';
import type { CreatedRoom, RiverId } from '@/types/domain';
import { inviteUrl, saveInvite } from './invite';

type Kind = 'couple' | 'private';

const KINDS: { value: Kind; label: string; hint: string; Icon: typeof Heart }[] = [
  { value: 'couple', label: 'ห้องคู่', hint: 'สองคน ลอยกับแฟนหรือคนพิเศษ', Icon: Heart },
  { value: 'private', label: 'ห้องเพื่อน', hint: 'ชวนได้สูงสุด 30 คน', Icon: Users },
];

export function CreateRoomPanel({ onCreated }: { onCreated?: () => void } = {}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>('couple');
  const [riverId, setRiverId] = useState<RiverId>('sut');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Only problems with the name itself mark the name field invalid.
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedRoom | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = cleanText(title);
    if (!value) {
      setError('ตั้งชื่อห้องก่อนนะ เพื่อนจะได้รู้ว่าเป็นห้องไหน');
      setTitleInvalid(true);
      return;
    }
    if (charLength(value) > 60) {
      setError('ชื่อห้องยาวเกินไป ขอไม่เกิน 60 ตัวอักษร');
      setTitleInvalid(true);
      return;
    }
    if (containsBlockedWords(value)) {
      setError('ชื่อห้องมีคำที่ไม่เหมาะสม ลองเปลี่ยนคำดูนะ');
      setTitleInvalid(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await backend.createPrivateRoom(riverId, kind, value);
      saveInvite(result.room.id, result.inviteToken);
      setCreated(result);
      onCreated?.();
    } catch (err) {
      // Rooms have only a daily limit, so the generic "slow down" text would mislead here.
      const code = (err as { code?: string })?.code;
      setError(code === 'rate_limited' ? 'วันนี้เปิดห้องครบ 5 ห้องแล้ว ลองใหม่พรุ่งนี้นะ' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const url = inviteUrl(created.inviteToken);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        setError('คัดลอกไม่สำเร็จ กดค้างที่ลิงก์เพื่อคัดลอกเองได้');
      }
    };
    const share = async () => {
      try {
        await navigator.share({ title: created.room.title, text: 'มาลอยกระทงนำกันเด้อ', url });
      } catch {
        // The visitor closed the share sheet.
      }
    };
    return (
      <div className="rounded-[2rem] border border-gold/30 bg-surface p-6 sm:p-8">
        <h3 className="text-2xl font-semibold">เปิดห้อง “{created.room.title}” แล้ว</h3>
        <ol className="mt-4 space-y-2 text-ink">
          <li>
            <span className="text-gold">๑</span> กดคัดลอกลิงก์ชวน แล้วส่งให้คนที่อยากชวนทาง LINE หรือแชตไหนก็ได้
          </li>
          <li>
            <span className="text-gold">๒</span> เขากดลิงก์ก็เข้ามาลอยในห้องนี้ได้เลย ไม่ต้องสมัคร
          </li>
          <li>
            <span className="text-gold">๓</span> กระทงในห้องนี้เห็นกันเฉพาะคนในห้อง
          </li>
        </ol>
        <p className="mt-3 text-sm text-mist">
          {created.room.roomType === 'couple' ? 'ห้องคู่รับได้ 2 คนรวมคุณ ' : 'ห้องเพื่อนรับได้ 30 คน '}
          ห้องปิดเองใน 3 วัน ลิงก์นี้หาได้อีกที่หัวข้อห้องของคุณ
        </p>
        <p className="mt-3 truncate rounded-xl bg-night/60 px-3 py-2 text-sm text-mist select-all" title={url}>
          {url}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์ชวน'}
          </Button>
          {'share' in navigator && (
            <Button variant="ghost" onClick={share}>
              <Share2 className="size-4" aria-hidden />
              ส่งให้เพื่อน
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate(`/room/${created.room.id}`)}>
            เข้าห้อง
          </Button>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreated(null);
            setTitle('');
            setError(null);
          }}
          className="mt-4 inline-flex min-h-11 items-center text-sm text-mist underline-offset-4 hover:text-ink hover:underline"
        >
          เปิดห้องอื่นอีก
        </button>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[2rem] border border-violet/25 bg-surface/70 p-6 sm:p-8">
      <h3 className="text-2xl font-semibold">ลอยกับคนกันเอง</h3>
      <p className="mt-2 max-w-[56ch] text-mist">
        เปิดห้องส่วนตัวแล้วส่งลิงก์ชวน กระทงในห้องจะเห็นกันเฉพาะคนที่เข้าห้องเท่านั้น
      </p>

      <fieldset className="mt-6">
        <legend className="mb-3 font-medium text-ink">แบบห้อง</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map(({ value, label, hint, Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${
                kind === value ? 'border-violet bg-violet/12' : 'border-ink/15 hover:border-ink/40'
              }`}
            >
              <input type="radio" name="room-kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
              <span className="inline-flex items-center gap-2 font-medium text-ink">
                <Icon className="size-4 text-violet" aria-hidden />
                {label}
              </span>
              <span className="text-sm text-mist">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="room-river" className="mb-2 block font-medium text-ink">
            ลอยที่
          </label>
          <select
            id="room-river"
            value={riverId}
            onChange={(e) => setRiverId(e.target.value as RiverId)}
            className="h-12 w-full rounded-2xl border border-ink/15 bg-night px-4 text-ink focus:border-gold focus:outline-none"
          >
            {RIVERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="room-title" className="mb-2 block font-medium text-ink">
            ชื่อห้อง
          </label>
          <input
            id="room-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
              setTitleInvalid(false);
            }}
            placeholder={kind === 'couple' ? 'เช่น ปีแรกของเรา' : 'เช่น แก๊งวิศวะปี 3'}
            maxLength={70}
            aria-invalid={titleInvalid}
            aria-describedby={titleInvalid ? 'room-error' : undefined}
            className="h-12 w-full rounded-2xl border border-ink/15 bg-night px-4 text-ink focus:border-gold focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <p id="room-error" className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="mt-6">
        {busy ? 'กำลังเปิดห้อง' : 'เปิดห้องแล้วรับลิงก์ชวน'}
      </Button>
    </form>
  );
}
