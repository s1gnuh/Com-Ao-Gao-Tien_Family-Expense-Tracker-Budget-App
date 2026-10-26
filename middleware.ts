import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

const PUBLIC_PATHS = ['/login', '/auth'];

const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
const AUTH_COOKIE = `sb-${PROJECT_REF}-auth-token`;

/** Refresh this long before expiry rather than waiting for the token to lapse. */
const REFRESH_WINDOW_S = 60;

function decodeBase64(value: string): string {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/**
 * Unix seconds the stored session expires at, or null when there is no readable
 * session. Reads the cookie only — @supabase/ssr splits long sessions across
 * `name.0`, `name.1`, so the parts are rejoined in name order.
 */
function sessionExpiry(request: NextRequest): number | null {
  const parts = request.cookies
    .getAll()
    .filter(({ name }) => name === AUTH_COOKIE || name.startsWith(`${AUTH_COOKIE}.`))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ value }) => value);

  if (parts.length === 0) return null;

  let raw = parts.join('');
  if (raw.startsWith('base64-')) raw = raw.slice('base64-'.length);

  try {
    const session = JSON.parse(decodeBase64(raw)) as { expires_at?: number };
    return typeof session.expires_at === 'number' ? session.expires_at : null;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest) {
  const redirect = request.nextUrl.clone();
  redirect.pathname = '/login';
  redirect.searchParams.set('next', request.nextUrl.pathname);
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
    if (isPublic && pathname === '/login') {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/';
      redirect.search = '';
      return NextResponse.redirect(redirect);
    }
    return NextResponse.next({ request });
  }

  if (expiry === null && !isPublic) return redirectToLogin(request);
  if (expiry === null) return NextResponse.next({ request });

  // Expired or nearly so: talk to Supabase, which rotates the token and writes
  // the refreshed cookies onto the response.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  const { data } = await supabase.auth.getUser();

  if (!data.user && !isPublic) return redirectToLogin(request);

  if (data.user && pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  // huong-dan.html is the user guide: a static help page that should open even
  // for someone who is not signed in, so it never reaches the redirect above.
  matcher: [
    '/((?!_next/static|_next/image|icons|brand|favicon.ico|manifest.webmanifest|huong-dan.html|.*\\.png$).*)',
  ],
};
