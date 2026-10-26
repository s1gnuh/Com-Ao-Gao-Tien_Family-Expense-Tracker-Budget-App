'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Four people entering spending at once would otherwise refetch per keystroke-sized event. */
const COALESCE_MS = 400;

/**
 * Server components own every figure on screen, so a change anywhere in the
 * household just needs them re-run — router.refresh() refetches on the server
 * and patches the tree in place, keeping scroll position and form state.
 */
export default function RealtimeSync() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function scheduleRefresh() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), COALESCE_MS);
    }

    const channel = supabase
      .channel('household-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, scheduleRefresh)
      .subscribe();

    // Realtime drops the socket while the PWA is backgrounded on iOS, so what
    // changed meanwhile never arrives as an event.
    function onVisible() {
      if (document.visibilityState === 'visible') scheduleRefresh();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
