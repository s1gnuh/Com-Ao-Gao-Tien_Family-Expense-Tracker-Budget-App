'use client';

import { useEffect } from 'react';

export type ToastTone = 'error' | 'info' | 'success';

interface ToastProps {
  title: string;
  description?: string;
  /** Small line under the description, for a standing reminder. */
  note?: string;
  tone?: ToastTone;
  onClose: () => void;
  /** Milliseconds before it dismisses itself. */
  duration?: number;
}

const FACE: Record<ToastTone, string> = {
  error: '⚠️',
  info: 'ℹ️',
  success: '✅',
};

const TITLE_COLOUR: Record<ToastTone, string> = {
  error: 'text-expense',
  info: 'text-fg',
  success: 'text-income',
};

export default function Toast({
  title,
  description,
  note,
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
      <div aria-hidden className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" />

      <div
        role="alert"
        aria-live="assertive"
        className="relative w-full max-w-xs rounded-3xl bg-surface p-6 text-center shadow-2xl"
        style={{ animation: 'cagt-pop-in 260ms cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
      >
        <span aria-hidden className="text-4xl">
          {FACE[tone]}
        </span>
        <p className={`mt-2 text-lg font-semibold ${TITLE_COLOUR[tone]}`}>{title}</p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}

        {note && (
          <p className="mt-3 rounded-2xl bg-bg px-3 py-2 text-xs text-muted">{note}</p>
        )}

        <p className="mt-3 text-xs text-muted">Chạm để đóng</p>
      </div>
    </div>
  );
}
