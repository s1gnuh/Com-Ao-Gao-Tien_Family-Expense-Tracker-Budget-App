'use client';

import {
  createBrowserClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from '@supabase/ssr';
import { AUTH_COOKIE_OPTIONS, SERVER_WRITTEN_MARKER } from '@/lib/supabase/cookies';

let touchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Asks the server to re-send the session the browser just wrote. Cookies set by
 * `document.cookie` are capped at 7 days by Safari; the same values coming back
 * in a `Set-Cookie` header get the full 400. `keepalive` lets the request finish
 * even if the app is swiped away right after a token refresh.
 */
function scheduleServerTouch() {
  if (touchTimer) clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    touchTimer = null;
    void fetch('/api/auth/touch', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {
      // The marker below is already gone, so the next page load re-issues the
      // cookies from middleware instead. Nothing is lost by failing here.
    });
  }, 250);
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return parseCookieHeader(document.cookie);
        },
        setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
          let wroteSession = false;
          for (const { name, value, options } of cookies) {
            document.cookie = serializeCookieHeader(name, value, options);
            if (value) wroteSession = true;
          }
          // Written here means written by script, so capped by Safari: drop the
          // marker so middleware knows to re-issue them properly.
          document.cookie = serializeCookieHeader(SERVER_WRITTEN_MARKER, '', {
            path: '/',
            maxAge: 0,
          });
          if (wroteSession) scheduleServerTouch();
        },
      },
    },
  );
}
