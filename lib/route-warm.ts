'use client';

/**
 * Every screen a tap on the bottom bar (or the overview's links) can reach,
 * most likely next first. Prefetched in full — data included — so moving
 * between them is served from the client router cache with no round trip.
 */
export const WARM_ROUTES = [
  '/',
  '/transactions/add',
  '/transactions',
  '/wallets',
  '/settings',
  '/bills',
] as const;

/** Fired when something just emptied the router cache and it should refill now. */
export const WARM_EVENT = 'cagt:warm';

/**
 * Asks RouteWarmer to refill the cache. Next wipes every prefetched screen
 * whenever a server action revalidates or router.refresh() lands, so after a
 * save each tab would otherwise load from scratch on the next tap.
 */
export function requestWarm() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WARM_EVENT));
}

let localMutationAt = 0;

/**
 * Called as a form submits a change. The same change comes back a moment later
 * as a realtime event; the save already re-rendered this screen with it, so
 * RealtimeSync can skip refreshing everything a second time for its own echo.
 */
export function markLocalMutation() {
  localMutationAt = Date.now();
}

export function mutatedLocallyWithin(ms: number): boolean {
  return Date.now() - localMutationAt < ms;
}

/**
 * Handlers that start fetching a page — data included — the moment a finger
 * lands on its link, a hundred-odd milliseconds before the tap completes.
 * Cheaper than prefetching every row of a long list up front.
 */
export function intentPrefetch(router: { prefetch: (href: string) => void }, href: string) {
  const go = () => router.prefetch(href);
  return { onTouchStart: go, onMouseEnter: go, onFocus: go };
}
