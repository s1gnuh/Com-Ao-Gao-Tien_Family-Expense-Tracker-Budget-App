import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
}

export default function Input({ label, hint, className = '', id, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <input
        {...props}
        id={inputId}
        className={`w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand ${className}`}
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
