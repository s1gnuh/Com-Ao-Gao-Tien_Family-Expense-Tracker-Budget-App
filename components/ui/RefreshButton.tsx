'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Long enough that a fast refresh still reads as an action, not a flicker. */
const MIN_SPIN_MS = 650;

export default function RefreshButton({ label = 'Làm mới số liệu' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function handleClick() {
    if (spinning) return;
    setDone(false);
    setSpinning(true);
    const startedAt = Date.now();

    startTransition(() => {
      router.refresh();
    });

    // router.refresh() resolves through the transition, but a sub-100ms round
    // trip would blink the icon; hold the spin to the floor instead.
    timers.current.push(
      setTimeout(
        () => {
          setSpinning(false);
          setDone(true);
          timers.current.push(setTimeout(() => setDone(false), 1800));
        },
        Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt)),
      ),
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={spinning || pending}
        aria-label={label}
        className="tap flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-brand-strong disabled:opacity-70"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={spinning ? { animation: 'cagt-spin 650ms linear infinite' } : undefined}
        >
          <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
          <path d="M20.5 4.2v4.6h-4.6" />
        </svg>
      </button>

      {done && (
        <span
          role="status"
          className="pointer-events-none absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-xl bg-fg px-3 py-1.5 text-xs font-medium text-bg shadow-lg"
          style={{ animation: 'cagt-rise 220ms ease-out both' }}
        >
          Đã cập nhật số liệu mới!
        </span>
      )}
    </div>
  );
}
