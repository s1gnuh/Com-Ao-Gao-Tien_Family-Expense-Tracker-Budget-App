import type { CookieOptions } from '@supabase/ssr';

/**
 * The longest lifetime a browser will keep a cookie for (Chrome and the HTTP
 * cookie draft both cap at 400 days). Every client below writes with this, and
 * every visit re-issues it, so a session only ends if the app goes unopened for
 * more than 400 days — or Supabase itself revokes the refresh token.
 */
export const SESSION_MAX_AGE_S = 400 * 24 * 60 * 60;

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  sameSite: 'lax',
  // Not httpOnly: the browser client has to read the session to open the
  // realtime socket. Safe because nothing in it is worth more than the session
  // the same page already holds.
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_MAX_AGE_S,
};

/**
 * Marker that the auth cookies were last written by the server.
 *
 * Why it exists: Safari (ITP) caps any cookie written through `document.cookie`
 * at 7 days, however long its max-age says. The browser Supabase client writes
 * exactly that way whenever it refreshes the token, so a phone left alone for a
 * week came back logged out. A cookie sent in a `Set-Cookie` response header
 * has no such cap. The browser client deletes this marker every time it writes,
 * and middleware re-issues the session from the server whenever the marker is
 * missing — turning the capped copy back into a 400-day one.
 */
export const SERVER_WRITTEN_MARKER = 'cagt-sess-srv';
/** Short on purpose: also re-issues once a day for anyone who never trips the marker. */
export const SERVER_WRITTEN_MARKER_MAX_AGE_S = 24 * 60 * 60;

export function projectRef(): string {
  return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]!;
}

export function authCookieName(): string {
  return `sb-${projectRef()}-auth-token`;
}

/** The session cookie and its `.0`, `.1` chunks — not the PKCE verifier. */
export function isAuthCookie(name: string, base: string = authCookieName()): boolean {
  if (name === base) return true;
  return name.startsWith(`${base}.`) && /^\d+$/.test(name.slice(base.length + 1));
}

export interface StoredSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id?: string; email?: string };
}

/**
 * Supabase writes the session as base64url ("base64-" prefix, `-` and `_`, no
 * padding). Plain `atob` only reads the standard alphabet and throws on those
 * two characters — which in Node, and in a spec-strict edge runtime, made the
 * whole session read as missing.
 */
function decodeBase64Url(value: string): string {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/**
 * Reassembles the session from its cookie chunks without contacting the auth
 * server. NOT verified — callers may only use it to choose which rows to ask
 * for or where to route someone; RLS validates the real token on every query.
 */
export function readStoredSession(
  cookies: { name: string; value: string }[],
  base: string = authCookieName(),
): StoredSession | null {
  const chunk = (name: string) => {
    const suffix = name.slice(base.length + 1);
    return suffix ? Number(suffix) : -1;
  };

  const parts = cookies
    .filter(({ name }) => isAuthCookie(name, base))
    .sort((a, b) => chunk(a.name) - chunk(b.name))
    .map(({ value }) => value);

  if (parts.length === 0) return null;

  let raw = parts.join('');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Already plain.
  }

  try {
    const json = raw.startsWith('base64-') ? decodeBase64Url(raw.slice('base64-'.length)) : raw;
    return JSON.parse(json) as StoredSession;
  } catch {
    return null;
  }
}
