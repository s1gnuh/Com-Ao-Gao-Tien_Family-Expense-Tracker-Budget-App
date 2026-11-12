import { NextResponse, type NextRequest } from 'next/server';
import { reissueSessionCookies } from '@/lib/supabase/reissue';

/**
 * Called by the browser Supabase client right after it rotates the session
 * into `document.cookie`. Safari caps script-written cookies at 7 days, so this
 * sends the very same values back as real `Set-Cookie` headers, which it keeps
 * for the full 400. See SERVER_WRITTEN_MARKER for the long version.
 */
export async function POST(request: NextRequest) {
  // Same-origin only. Echoing someone's own cookies is harmless, but there is
  // no reason to answer another site at all.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return new NextResponse(null, { status: 403 });
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
  reissueSessionCookies(request.cookies, response);
  return response;
}
