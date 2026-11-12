import type { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_OPTIONS,
  SERVER_WRITTEN_MARKER,
  SERVER_WRITTEN_MARKER_MAX_AGE_S,
  authCookieName,
  isAuthCookie,
} from '@/lib/supabase/cookies';

type CookieSource = Pick<NextRequest['cookies'], 'getAll'>;

/**
 * Echoes the caller's own session cookies back in `Set-Cookie`, with the full
 * 400-day lifetime. Only ever repeats what the browser already sent, so there is
 * nothing here an outside page could use to plant a session of its choosing.
 * Returns false when there is no session to re-issue.
 */
export function reissueSessionCookies(source: CookieSource, response: NextResponse): boolean {
  const base = authCookieName();
  const session = source.getAll().filter(({ name }) => isAuthCookie(name, base));
  if (session.length === 0) return false;

  for (const { name, value } of session) {
    response.cookies.set(name, value, AUTH_COOKIE_OPTIONS);
  }
  markServerWritten(response);
  return true;
}

export function markServerWritten(response: NextResponse) {
  response.cookies.set(SERVER_WRITTEN_MARKER, '1', {
    path: '/',
    sameSite: 'lax',
    // Readable by script on purpose: the browser client deletes it whenever it
    // writes the session itself, which is the whole signal.
    httpOnly: false,
    secure: AUTH_COOKIE_OPTIONS.secure,
    maxAge: SERVER_WRITTEN_MARKER_MAX_AGE_S,
  });
}

/** Removes every auth cookie the request carried, for a session that is truly over. */
export function clearSessionCookies(source: CookieSource, response: NextResponse) {
  const base = authCookieName();
  for (const { name } of source.getAll()) {
    if (isAuthCookie(name, base) || name === SERVER_WRITTEN_MARKER) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 });
    }
  }
}

/** Carries cookies a Supabase refresh already wrote onto a response we replace. */
export function copyResponseCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}
