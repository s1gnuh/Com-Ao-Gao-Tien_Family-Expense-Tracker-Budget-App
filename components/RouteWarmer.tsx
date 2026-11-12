'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { WARM_EVENT, WARM_ROUTES } from '@/lib/route-warm';

/** Lets the screen being opened finish first; warming is background work. */
const SETTLE_MS = 250;
/**
 * Safety net for any cache wipe nobody announced. A prefetch of a screen that
 * is already cached is only a lookup in a Map, so ticking costs nothing until
 * there is actually something to refill.
 */
const TICK_MS = 4000;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

/**
 * Keeps every tab's full payload — data included — in the client router cache,
 * so switching tabs never waits on the server.
 *
 * Next's own <Link> prefetch only fetches up to the loading skeleton for a
 * dynamic page, and once a save or a realtime refresh empties the cache it does
 * not fetch again. `router.prefetch()` asks for the whole page, and re-asking
 * for one already cached is skipped by the router itself, so this simply asks
 * again whenever the cache may have been emptied.
 */
export default function RouteWarmer() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function warmNow() {
      if (document.visibilityState !== 'visible') return;
      const current = pathnameRef.current;
      for (const route of WARM_ROUTES) {
        if (route !== current) router.prefetch(route);
      }
    }

    function schedule() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const idle = (window as IdleWindow).requestIdleCallback;
        if (idle) idle(warmNow, { timeout: 800 });
        else warmNow();
      }, SETTLE_MS);
    }

    schedule();
    window.addEventListener(WARM_EVENT, schedule);
    document.addEventListener('visibilitychange', schedule);
    const tick = setInterval(warmNow, TICK_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(WARM_EVENT, schedule);
      document.removeEventListener('visibilitychange', schedule);
      clearInterval(tick);
    };
  }, [router]);

  // Arriving somewhere new — including the redirect after a save, which is
  // exactly when the cache was just emptied — refills it.
  useEffect(() => {
    window.dispatchEvent(new Event(WARM_EVENT));
  }, [pathname]);

  return null;
}
