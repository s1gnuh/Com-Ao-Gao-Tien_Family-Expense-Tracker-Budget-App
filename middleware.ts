import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import {
  AUTH_COOKIE_OPTIONS,
  SERVER_WRITTEN_MARKER,
  authCookieName,
  readStoredSession,
} from '@/lib/supabase/cookies';
import {
  clearSessionCookies,
  copyResponseCookies,
  markServerWritten,
  reissueSessionCookies,
} from '@/lib/supabase/reissue';

type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

const PUBLIC_PATHS = ['/login'];

const AUTH_COOKIE = authCookieName();

/** Refresh this long before expiry rather than waiting for the token to lapse. */
const REFRESH_WINDOW_S = 60;

/** Unix seconds the stored session expires at, or null when there is none to read. */
function sessionExpiry(request: NextRequest): number | null {
  const expiresAt = readStoredSession(request.cookies.getAll(), AUTH_COOKIE)?.expires_at;
  return typeof expiresAt === 'number' ? expiresAt : null;
}

function redirectToLogin(request: NextRequest, reason?: 'expired') {
  const redirect = request.nextUrl.clone();
  redirect.pathname = '/login';
  redirect.search = '';
  if (request.nextUrl.pathname !== '/') redirect.searchParams.set('next', request.nextUrl.pathname);
  if (reason) redirect.searchParams.set('reason', reason);
  return NextResponse.redirect(redirect);
}

function redirectHome(request: NextRequest) {
  const redirect = request.nextUrl.clone();
  redirect.pathname = '/';
  redirect.search = '';
  return NextResponse.redirect(redirect);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Route handlers answer with JSON; redirecting them to /login would hand
  // fetch() an HTML page. They enforce auth themselves.
  if (pathname.startsWith('/api/')) return NextResponse.next({ request });

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const expiry = sessionExpiry(request);
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Fast path. auth.getUser() is a round trip to Supabase — measured at 300-400ms
  // — and running it per navigation is what made moving between tabs feel slow.
  // Deciding *where to send someone* only needs the expiry already in the cookie;
  // every byte of data behind that decision is still gated by RLS, which
  // validates the token server-side on each query.
  if (expiry !== null && expiry - nowSeconds > REFRESH_WINDOW_S) {
    const response = isPublic && pathname === '/login' ? redirectHome(request) : NextResponse.next({ request });

    // The browser last wrote the session itself (capped at 7 days by Safari),
    // or a day has passed: send it back from here so it lives the full 400.
    if (!request.cookies.has(SERVER_WRITTEN_MARKER)) reissueSessionCookies(request.cookies, response);
    return response;
  }

  if (expiry === null) {
    return isPublic ? NextResponse.next({ request }) : redirectToLogin(request);
  }

  // Expired or nearly so: talk to Supabase, which rotates the token and writes
  // the refreshed cookies onto the response.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();

  if (!data.user) {
    // A dropped connection says nothing about the session. Logging someone out
    // because the phone was briefly offline would undo the whole point of a
    // session that lasts; let the page load and the next visit try again.
    if (error && isAuthRetryableFetchError(error)) return response;

    // The refresh token itself was refused: revoked, already used, or the
    // account is gone. There is no way back without the password, so clear
    // every trace of the old session rather than retrying it on every request,
    // and tell the login screen why the person landed there.
    const redirect = isPublic ? NextResponse.next({ request }) : redirectToLogin(request, 'expired');
    clearSessionCookies(request.cookies, redirect);
    return redirect;
  }

  markServerWritten(response);

  // Any response we hand back instead of `response` must carry the rotated
  // cookies with it. Dropping them throws away the new refresh token after the
  // old one was already spent, and Supabase revokes a session whose spent token
  // turns up again — which is how a redirect alone used to log people out.
  if (pathname === '/login') return copyResponseCookies(response, redirectHome(request));

  return response;
}

export const config = {
  // huong-dan.html is the user guide: a static help page that should open even
  // for someone who is not signed in, so it never reaches the redirect above.
  // sw.js has to stay reachable the same way — a browser registering or
  // re-checking the service worker never carries a session, and a login
  // redirect there isn't a page navigation the browser will follow: it just
  // fails the registration outright ("script resource is behind a redirect").
  matcher: [
    '/((?!_next/static|_next/image|icons|brand|favicon.ico|manifest.webmanifest|huong-dan.html|sw.js|.*\\.png$).*)',
  ],
};
