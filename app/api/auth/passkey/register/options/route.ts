import { NextResponse, type NextRequest } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { RP_NAME, relyingParty, saveChallenge } from '@/lib/webauthn';

export const runtime = 'nodejs';

/** Step one of turning on Face ID for this device: needs a real session. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Phiên đăng nhập đã hết.' }, { status: 401 });

  const supabase = await createClient();
  const [{ data: profile }, { data: existing }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    supabase.from('passkeys').select('credential_id,transports').eq('user_id', user.id),
  ]);

  const username = (user.email ?? '').split('@')[0] || 'thanh-vien';
  const { rpID } = relyingParty(request);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: username,
    userDisplayName: (profile?.display_name as string | undefined) ?? username,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    // A device that already holds one of this person's passkeys is told so,
    // rather than quietly making a second for the same phone.
    excludeCredentials: (existing ?? []).map((row) => ({
      id: row.credential_id as string,
      transports: (row.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      // The phone's own Face ID / Touch ID, not a USB key, and discoverable so
      // signing in later needs no username at all.
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    },
  });

  try {
    await saveChallenge('register', options.challenge, user.id);
  } catch {
    return NextResponse.json(
      { error: 'Thiếu bảng passkeys trong cơ sở dữ liệu. Chạy lại supabase/schema.sql.' },
      { status: 500 },
    );
  }

  return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } });
}
