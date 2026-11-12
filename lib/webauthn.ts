import 'server-only';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { SERVER_WRITTEN_MARKER, SERVER_WRITTEN_MARKER_MAX_AGE_S } from '@/lib/supabase/cookies';

export const RP_NAME = 'Cơm Áo Gạo Tiền';

/** Holds the id of the one challenge this browser is answering. */
const CHALLENGE_COOKIE = 'cagt-wa';
const CHALLENGE_TTL_S = 5 * 60;

/**
 * A passkey is bound to the exact domain it was made on. Taken from the request
 * so the same code serves production and localhost; it does mean a passkey made
 * on a Vercel preview URL only works on that preview, never on production.
 */
export function relyingParty(request: NextRequest): { rpID: string; origin: string } {
  return { rpID: request.nextUrl.hostname, origin: request.nextUrl.origin };
}

export async function saveChallenge(
  kind: 'register' | 'login',
  challenge: string,
  userId: string | null,
): Promise<void> {
  const service = createServiceClient();

  // Housekeeping on the way in: abandoned prompts would otherwise pile up.
  await service.from('webauthn_challenges').delete().lt('expires_at', new Date().toISOString());

  const { data, error } = await service
    .from('webauthn_challenges')
    .insert({ kind, challenge, user_id: userId })
    .select('id')
    .single();
  if (error || !data) throw new Error('challenge-store');

  (await cookies()).set(CHALLENGE_COOKIE, data.id as string, {
    path: '/api/auth/passkey',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CHALLENGE_TTL_S,
  });
}

/**
 * Hands back the challenge this browser was issued and deletes it in the same
 * statement, so it answers exactly one attempt. Null when missing, expired,
 * issued for the other ceremony, or issued to someone else.
 */
export async function consumeChallenge(
  kind: 'register' | 'login',
  userId: string | null,
): Promise<string | null> {
  const store = await cookies();
  const id = store.get(CHALLENGE_COOKIE)?.value;
  store.delete({ name: CHALLENGE_COOKIE, path: '/api/auth/passkey' });
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { data } = await createServiceClient()
    .from('webauthn_challenges')
    .delete()
    .eq('id', id)
    .select('challenge,kind,user_id,expires_at')
    .maybeSingle();

  if (!data) return null;
  if (data.kind !== kind) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  if (kind === 'register' && data.user_id !== userId) return null;
  return data.challenge as string;
}

/**
 * Signs the person in as `userId` after their passkey checked out.
 *
 * Supabase has no "sign in as this user" call, but it can mint a one-time
 * magic-link token server side without sending anything (accounts here live on
 * an internal address no mail ever reaches). Redeeming that token through the
 * cookie-bound client writes an ordinary session — the same 400-day cookies a
 * password login gets, refreshed the same way.
 */
export async function signInAs(userId: string): Promise<boolean> {
  const service = createServiceClient();

  const { data: found, error: findError } = await service.auth.admin.getUserById(userId);
  const email = found?.user?.email;
  if (findError || !email) return false;

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return false;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (error) return false;

  // Written by the server, so already good for 400 days; tell middleware so.
  (await cookies()).set(SERVER_WRITTEN_MARKER, '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SERVER_WRITTEN_MARKER_MAX_AGE_S,
  });
  return true;
}

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}
