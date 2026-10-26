import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

const PUBLIC_PATHS = ['/login', '/auth'];

export async function middleware(request: NextRequest) {
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
  const { pathname } = request.nextUrl;

  // Route handlers answer with JSON; redirecting them to /login would hand
  // fetch() an HTML page. They enforce auth themselves.
  if (pathname.startsWith('/api/')) return response;

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!data.user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(redirect);
  }

  if (data.user && pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons|favicon.ico|manifest.webmanifest|.*\\.png$).*)'],
};
