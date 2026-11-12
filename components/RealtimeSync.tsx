'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { mutatedLocallyWithin } from '@/lib/route-warm';
import { useRefresh } from '@/lib/use-refresh';

/** Shortest gap between two refreshes. Bursts inside it collapse into one. */
const COOLDOWN_MS = 600;
/**
 * How long after this phone saves something its own realtime echo is ignored.
 * Supabase delivers the event 0.4-1s after the commit; the margin covers a slow
 * network without hiding anyone else's change for long.
 */
const ECHO_WINDOW_MS = 8000;

const TABLES = ['transactions', 'budgets', 'recurring_bills', 'wallets'] as const;

type Row = Record<string, unknown>;

/**
 * Server components own every figure on screen, so a change anywhere in the
 * household just needs them re-run — router.refresh() refetches on the server
 * and patches the tree in place, keeping scroll position and form state.
 */
export default function RealtimeSync() {
  const { refresh: refreshNow } = useRefresh();
  const lastRun = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = useRef<string | null>(null);

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
      refreshNow();
      return;
    }

    if (trailing.current) return;
    trailing.current = setTimeout(() => {
      trailing.current = null;
      lastRun.current = Date.now();
      refreshNow();
    }, COOLDOWN_MS - since);
  }, [refreshNow]);

  useEffect(() => {
    const supabase = createClient();

    // Read from the cookie, no network: only used to recognise our own echo.
    void supabase.auth.getSession().then(({ data }) => {
      me.current = data.session?.user.id ?? null;
    });

    /**
     * A save on this phone already re-rendered this screen with the change, and
     * RouteWarmer refills the other tabs after it. Refreshing again for the
     * same row would redo all of that — and empty the cache it just refilled.
     * Anyone else's change still refreshes.
     *
     * Rows that name no author (a budget, the shared fund, whose owner_id is
     * null) are taken as this phone's own echo while its save is that recent.
     * Refreshing for them queued the next save behind a full re-render, since
     * the router runs server actions only after a pending refresh lands. The
     * cost is a household member's budget edit in those same few seconds
     * waiting for the next refresh, which in a four-person home is rare.
     */
    function onChange(payload: RealtimePostgresChangesPayload<Row>) {
      if (me.current && mutatedLocallyWithin(ECHO_WINDOW_MS)) {
        const row: Row =
          payload.new && Object.keys(payload.new).length > 0 ? payload.new : (payload.old as Row);
        if (row) {
          const author = row.created_by ?? row.owner_id ?? null;
          if (author === me.current || author === null) return;
        }
      }
      refresh();
    }

    let channel = supabase.channel('household-changes');
    for (const table of TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    }
    channel.subscribe();

    // Realtime drops the socket while the PWA is backgrounded on iOS, so what
    // changed meanwhile never arrives as an event — but only once the socket
    // actually drops. Refreshing on every foreground return regardless (a
    // glance at another app counts) wiped the whole Router Cache for nothing,
    // so the next tab switched to always re-fetched from the server even
    // though nothing had changed.
    function onVisible() {
      if (document.visibilityState === 'visible' && channel.state !== 'joined') refresh();
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
