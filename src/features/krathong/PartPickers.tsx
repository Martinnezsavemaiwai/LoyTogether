import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { KrathongFlower } from '@/types/domain';
import { MAX_FLOWERS, type Option } from './options';

const SWATCH: Record<string, string> = {
  golden: '#f2c260',
  white: '#fbf6ea',
  gold: '#f5c76a',
  purple: '#b79cff',
  pink: '#ff9fc6',
  red: '#d8434e',
  pearl: '#fbf7ee',
  marigold: '#f7a531',
  rose: '#b8203e',
  orchid: '#a36ee0',
  lotus: '#f29bbf',
  jasmine: '#fbf7ee',
  chrysanthemum: '#ffd043',
  banana_leaf: '#4e9a5d',
  banana_rose: '#3f8a50',
  flower: '#f3c6d3',
  bread: '#c4843f',
  banana_trunk: '#d5dfb2',
  ice: '#cfe8ff',
};

const chip = (selected: boolean, disabled = false) =>
  `relative inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${
    selected
      ? 'border-gold bg-gold/15 text-ink'
      : disabled
        ? 'cursor-not-allowed border-ink/10 text-ink/35'
        : 'border-ink/15 text-ink/80 hover:border-ink/40'
  }`;

function Swatch({ value }: { value: string }) {
  const color = SWATCH[value];
  return color ? (
    <span aria-hidden className="size-3.5 shrink-0 rounded-full ring-1 ring-ink/30" style={{ background: color }} />
  ) : null;
}

function Legend({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <legend className="mb-2 flex w-full items-baseline justify-between gap-3 text-sm text-mist">
      <span>{children}</span>
      {hint && <span className="text-xs text-mist/80">{hint}</span>}
    </legend>
  );
}

/** One choice, optionally with "ไม่ใส่" for parts that can be left out. */
export function ChoicePicker<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  noneLabel,
  swatches = true,
}: {
  label: string;
  name: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  noneLabel?: string;
  /** Colour dots; off for shapes, whose names collide with flower colours. */
  swatches?: boolean;
}) {
  return (
    <fieldset>
      <Legend>{label}</Legend>
      <div className="flex flex-wrap gap-2">
        {noneLabel && (
          <label className={chip(value === null)}>
            <input type="radio" name={name} checked={value === null} onChange={() => onChange(null)} className="sr-only" />
            {noneLabel}
          </label>
        )}
        {options.map((option) => (
          <label key={option.value} className={chip(option.value === value)}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {swatches && <Swatch value={option.value} />}
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Up to MAX_FLOWERS kinds, or none at all. */
export function FlowerPicker({
  options,
  value,
  onToggle,
}: {
  options: Option<KrathongFlower>[];
  value: KrathongFlower[];
  onToggle: (kind: KrathongFlower) => void;
}) {
  const full = value.length >= MAX_FLOWERS;
  return (
    <fieldset>
      <Legend hint={`เลือกได้ ${MAX_FLOWERS} ชนิด ไม่เลือกก็ได้`}>ดอกไม้</Legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option.value);
          const disabled = full && !selected;
          return (
            <label key={option.value} className={chip(selected, disabled)}>
              <input
                type="checkbox"
                name="flowers"
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onToggle(option.value)}
                className="sr-only"
              />
              {selected ? <Check className="size-3.5 text-gold" aria-hidden /> : <Swatch value={option.value} />}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-ink/10 px-4 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold">
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-mist">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-ink/20 transition-colors peer-checked:bg-gold after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}
