'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Middleware catches a dead session on the next navigation, but the app can sit
 * open on one screen for hours. When the browser client's own refresh is turned
 * down — the refresh token revoked, or already spent elsewhere — Supabase emits
 * SIGNED_OUT and clears the cookies; this takes the person straight to the
 * login screen instead of leaving them on a page that quietly shows nothing.
 */
export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      const params = new URLSearchParams({ reason: 'expired' });
      if (pathname && pathname !== '/') params.set('next', pathname);
      router.replace(`/login?${params.toString()}`);
      router.refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [router, pathname]);

  return null;
}
