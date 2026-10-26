import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { readStoredSession } from '@/lib/auth';

type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies; middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

/** Verified against the auth server. Use for auth gates and before any write. */
export async function getSessionUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/**
 * Identity straight from the session cookie — no round trip, and getUser() costs
 * 300-400ms. Unverified, so it may only choose which rows to request; RLS still
 * validates the real token on every query. Never gate access on this.
 */
export async function readSessionFast() {
  const cookieStore = await cookies();
  const session = readStoredSession(cookieStore.getAll());
  return { id: session?.user?.id ?? null, email: session?.user?.email ?? '' };
}
