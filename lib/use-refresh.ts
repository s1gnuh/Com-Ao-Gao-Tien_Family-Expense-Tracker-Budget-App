'use client';

import { useCallback, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestWarm } from '@/lib/route-warm';

/**
 * router.refresh(), plus refilling the other tabs once it has landed.
 *
 * The refresh empties the whole router cache only when its response arrives,
 * so warming has to wait for that — warming straight away would cache pages
 * the refresh then throws out. Running it in a transition is what lets us see
 * when it finished.
 */
export function useRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      requestWarm();
    }
  }, [pending]);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  return { refresh, pending };
}

/**
 * For forms whose server action revalidates without leaving the page: the
 * action emptied the cache, so refill it as soon as the result is in.
 */
export function useWarmAfter(result: unknown, initial: unknown) {
  useEffect(() => {
    if (result !== initial) requestWarm();
  }, [result, initial]);
}
