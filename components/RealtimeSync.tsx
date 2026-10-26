'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Shortest gap between two refreshes. Bursts inside it collapse into one. */
const COOLDOWN_MS = 600;

/**
 * Server components own every figure on screen, so a change anywhere in the
 * household just needs them re-run — router.refresh() refetches on the server
 * and patches the tree in place, keeping scroll position and form state.
 */
export default function RealtimeSync() {
  const router = useRouter();
  const lastRun = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Leading edge, trailing coalesce. An isolated change — what actually happens
   * in a four-person household — refreshes immediately rather than waiting out
   * a debounce that exists only for bursts. Supabase already costs ~400-800ms
   * to deliver the event, so there is no budget left to spend on waiting.
   */
  const refresh = useCallback(() => {
    const now = Date.now();
    const since = now - lastRun.current;

    if (since >= COOLDOWN_MS) {
      lastRun.current = now;
      router.refresh();
      return;
    }

    if (trailing.current) return;
    trailing.current = setTimeout(() => {
      trailing.current = null;
      lastRun.current = Date.now();
      router.refresh();
    }, COOLDOWN_MS - since);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('household-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, refresh)
      .subscribe();

    // Realtime drops the socket while the PWA is backgrounded on iOS, so what
    // changed meanwhile never arrives as an event.
    function onVisible() {
      if (document.visibilityState === 'visible') refresh();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (trailing.current) clearTimeout(trailing.current);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return null;
}
