'use client';

import { useEffect } from 'react';

interface ToastProps {
  title: string;
  description?: string;
  tone?: 'error' | 'info';
  onClose: () => void;
  /** Milliseconds before it dismisses itself. */
  duration?: number;
}

export default function Toast({
  title,
  description,
  tone = 'error',
  onClose,
  duration = 3500,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-8"
      onClick={onClose}
      role="presentation"
    >
      <div aria-hidden className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div
        role="alert"
        aria-live="assertive"
        className="relative w-full max-w-xs rounded-2xl bg-surface p-5 text-center shadow-2xl"
      >
        <span aria-hidden className="text-4xl">
          {tone === 'error' ? '⚠️' : 'ℹ️'}
        </span>
        <p className={`mt-2 font-semibold ${tone === 'error' ? 'text-expense' : 'text-fg'}`}>
          {title}
        </p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        <p className="mt-3 text-xs text-muted">Chạm để đóng</p>
      </div>
    </div>
  );
}
