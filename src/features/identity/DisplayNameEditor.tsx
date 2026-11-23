import { useState, type FormEvent } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { errorMessage } from '@/lib/backend';
import { DISPLAY_NAME_MAX, validateDisplayName } from '@/lib/validation';
import { useIdentityStore } from '@/stores/identityStore';

export function DisplayNameEditor({ className = '' }: { className?: string }) {
  const identity = useIdentityStore((s) => s.identity);
  const rename = useIdentityStore((s) => s.rename);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!identity) return null;

  const start = () => {
    setValue(identity.displayName);
    setError(null);
    setEditing(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateDisplayName(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    try {
      await rename(result.value);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <span className="text-mist">ลอยในนาม</span>
        <span className="max-w-[12rem] truncate font-medium text-ink">{identity.displayName}</span>
        <button
          type="button"
          onClick={start}
          className="inline-flex size-11 items-center justify-center rounded-full text-mist hover:bg-ink/10 hover:text-gold"
          aria-label="แก้ไขชื่อที่แสดง"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-1">
        <label htmlFor="display-name" className="sr-only">
          ชื่อที่แสดง
        </label>
        <input
          id="display-name"
          autoFocus
          value={value}
          maxLength={DISPLAY_NAME_MAX + 4}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'display-name-error' : undefined}
          className="h-11 w-44 rounded-full border border-ink/20 bg-night/60 px-4 text-base text-ink focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex size-11 items-center justify-center rounded-full text-gold hover:bg-ink/10"
          aria-label="บันทึกชื่อ"
        >
          <Check className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="inline-flex size-11 items-center justify-center rounded-full text-mist hover:bg-ink/10"
          aria-label="ยกเลิก"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {error && (
        <p id="display-name-error" className="px-2 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
