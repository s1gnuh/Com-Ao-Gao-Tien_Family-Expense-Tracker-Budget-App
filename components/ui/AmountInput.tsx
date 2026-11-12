'use client';

import { useRef } from 'react';
import { formatVND, parseAmountInput } from '@/lib/formatters';

interface AmountInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Name of the visible field; the parsed number travels in a separate hidden input. */
  name?: string;
  size?: 'lg' | 'md';
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * The iPhone's number pad has digits and a separator and nothing else, so the
 * "35k" / "1tr2" shorthand the hint promised could not actually be typed — the
 * letters live on a keyboard this field never shows. These keys add them.
 */
const SHORTCUTS = [
  { label: '000', insert: '000', aria: 'Thêm ba số 0' },
  { label: 'k', insert: 'k', aria: 'Nghìn' },
  { label: 'tr', insert: 'tr', aria: 'Triệu' },
] as const;

export default function AmountInput({
  label = 'Số tiền',
  value,
  onChange,
  name,
  size = 'lg',
  required,
  autoFocus,
  placeholder = '35k, 1tr2, 250000',
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const amount = parseAmountInput(value);

  function press(insert: string) {
    const trimmed = value.trim();
    let next: string;
    if (insert === '000') {
      next = trimmed + insert;
    } else if (/[a-zA-Z]+$/.test(trimmed)) {
      // A second unit replaces the first instead of stacking into "35ktr".
      next = trimmed.replace(/[a-zA-Z]+$/, insert);
    } else {
      next = trimmed + insert;
    }
    onChange(next);
    // Back into the field so the keyboard stays up for the next digit.
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(next.length, next.length);
    });
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <div className="flex items-stretch gap-2">
        <input
          ref={inputRef}
          name={name}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          autoFocus={autoFocus}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={name ? `${name}-hint` : undefined}
          className={`tabular min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 font-semibold outline-none focus:border-brand ${
            size === 'lg' ? 'py-4 text-3xl' : 'py-3 text-2xl'
          }`}
        />
        {value && (
          <button
            type="button"
            aria-label="Xoá số tiền"
            // Keeps the field focused: a tap that moved focus here would drop
            // the keyboard only for the person to summon it again.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="tap flex w-11 shrink-0 items-center justify-center rounded-xl text-xl text-muted"
          >
            ×
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {SHORTCUTS.map((key) => (
          <button
            key={key.label}
            type="button"
            aria-label={key.aria}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => press(key.insert)}
            className="tap min-h-[40px] min-w-[52px] rounded-xl border border-border bg-bg px-3 text-sm font-semibold text-fg"
          >
            {key.label}
          </button>
        ))}
        <span
          id={name ? `${name}-hint` : undefined}
          aria-live="polite"
          className={`tabular ml-auto truncate text-right text-sm ${amount === null ? 'text-muted' : 'font-semibold text-fg'}`}
        >
          {amount === null ? (value ? 'Chưa hiểu số này' : 'Gõ 35k, 1tr2…') : formatVND(amount)}
        </span>
      </div>
    </div>
  );
}
