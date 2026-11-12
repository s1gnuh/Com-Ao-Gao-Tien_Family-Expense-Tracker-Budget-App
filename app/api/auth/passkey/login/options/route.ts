import { NextResponse, type NextRequest } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { relyingParty, saveChallenge } from '@/lib/webauthn';

export const runtime = 'nodejs';

/**
 * Public: there is no session yet, that is the point. No allowCredentials list,
 * so the phone offers whichever of this site's passkeys it holds and nobody can
 * probe which usernames have Face ID turned on.
 */
export async function POST(request: NextRequest) {
  const { rpID } = relyingParty(request);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
  });

  try {
    await saveChallenge('login', options.challenge, null);
  } catch {
    return NextResponse.json({ error: 'Đăng nhập Face ID chưa sẵn sàng.' }, { status: 503 });
  }

  return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } });
}
