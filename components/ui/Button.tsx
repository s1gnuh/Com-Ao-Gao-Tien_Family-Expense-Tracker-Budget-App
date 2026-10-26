import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white',
  secondary: 'border border-border bg-surface text-fg',
  ghost: 'text-brand',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
}

export default function Button({
  variant = 'primary',
  full = false,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`tap inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium disabled:opacity-60 ${
        VARIANTS[variant]
      } ${full ? 'w-full' : ''} ${className}`}
    />
  );
}
