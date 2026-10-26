'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Every tab, warmed while the splash plays so none of them loads on arrival. */
const ROUTES = ['/', '/transactions', '/wallets', '/settings', '/transactions/add'];

const MIN_MS = 4500;
/** Never hold the app hostage to a slow network. */
const MAX_MS = 7000;
const SESSION_KEY = 'cagt-splash-shown';

const GRAINS = [
  { left: '12%', delay: '0s', duration: '3.4s', size: 9, color: 'rgb(var(--c-accent))' },
  { left: '26%', delay: '0.9s', duration: '4.1s', size: 6, color: 'rgb(var(--c-brand))' },
  { left: '44%', delay: '0.35s', duration: '3.8s', size: 7, color: 'rgb(var(--c-sky))' },
  { left: '61%', delay: '1.5s', duration: '3.2s', size: 10, color: 'rgb(var(--c-accent))' },
  { left: '78%', delay: '0.6s', duration: '4.4s', size: 6, color: 'rgb(var(--c-brand))' },
  { left: '90%', delay: '2s', duration: '3.6s', size: 8, color: 'rgb(var(--c-sky))' },
];

export default function SplashScreen() {
  const router = useRouter();
  // Rendered on the server so it covers the very first paint. Starting hidden
  // and revealing after hydration would show the dashboard for a moment and
  // then throw a splash over it, which reads as a glitch. A blocking script in
  // the document head hides it before paint for sessions that already saw it.
  const [phase, setPhase] = useState<'hidden' | 'playing' | 'leaving'>('playing');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Once per app launch. A PWA resumed from the home screen keeps its
    // sessionStorage, so this does not replay on every navigation.
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      // Private mode can throw; showing the splash is the harmless fallback.
    }
    if (seen) {
      setPhase('hidden');
      return;
    }

    const openedAt = Date.now();

    // Prefetch pulls each route's rendered payload — queries already run — into
    // the client router cache, so arriving at a tab costs no round trip.
    const warmed = Promise.all(ROUTES.map((route) => Promise.resolve(router.prefetch(route))));

    let leaveTimer: ReturnType<typeof setTimeout>;
    const finish = () => {
      const held = Date.now() - openedAt;
      leaveTimer = setTimeout(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, '1');
        } catch {
          // Ignored: at worst the splash plays again next launch.
        }
        setPhase('leaving');
        setTimeout(() => setPhase('hidden'), 420);
      }, Math.max(0, MIN_MS - held));
    };

    const cap = setTimeout(finish, MAX_MS);
    void warmed.then(() => {
      clearTimeout(cap);
      finish();
    });

    return () => {
      clearTimeout(cap);
      clearTimeout(leaveTimer);
    };
  }, [router]);

  if (phase === 'hidden') return null;

  return (
    <div
      id="cagt-splash"
      role="status"
      aria-live="polite"
      aria-label="Đang tải Cơm Áo Gạo Tiền"
      className="splash-failsafe fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-bg"
      style={
        phase === 'leaving'
          ? { animation: 'cagt-fade-out 400ms ease-in forwards' }
          : undefined
      }
    >
      {/* Tint only the bottom. The logo file carries its own #fefcf5 backdrop,
          so any wash behind it turns those baked-in margins into a visible
          pale rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 100%, rgb(var(--c-accent) / 0.2), transparent 70%)',
        }}
      />

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2">
        {GRAINS.map((grain) => (
          <span
            key={grain.left}
            className="absolute bottom-6 block rounded-full"
            style={{
              left: grain.left,
              width: grain.size,
              height: grain.size,
              backgroundColor: grain.color,
              animation: `cagt-drift ${grain.duration} ease-in-out ${grain.delay} infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center px-8">
        <div
          className="relative"
          style={{ animation: 'cagt-logo-in 900ms cubic-bezier(0.34, 1.56, 0.64, 1) both' }}
        >
          <div style={{ animation: 'cagt-float 3.2s ease-in-out 900ms infinite' }}>
            <Image
              src="/brand/logo.png"
              alt="Cơm Áo Gạo Tiền"
              width={685}
              height={418}
              priority
              sizes="(max-width: 480px) 80vw, 340px"
              className="h-auto w-[min(82vw,352px)]"
            />
          </div>
        </div>

        <p
          className="relative mt-6 text-center text-sm font-medium text-muted"
          style={{ animation: 'cagt-rise 600ms ease-out 700ms both' }}
        >
          Đang dọn sổ chi tiêu của nhà mình…
        </p>

        <div
          className="relative mt-5 flex gap-2"
          style={{ animation: 'cagt-rise 600ms ease-out 900ms both' }}
          aria-hidden
        >
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="block h-2.5 w-2.5 rounded-full bg-brand"
              style={{ animation: `cagt-bounce 1.3s ease-in-out ${index * 0.16}s infinite` }}
            />
          ))}
        </div>
      </div>

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1 overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div
          className="h-1 w-full bg-brand"
          style={{ animation: `cagt-sweep ${MIN_MS}ms cubic-bezier(0.22, 0.9, 0.3, 1) both` }}
        />
      </div>
    </div>
  );
}
