import { NextResponse, type NextRequest } from 'next/server';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { consumeChallenge, relyingParty, toBase64Url } from '@/lib/webauthn';

export const runtime = 'nodejs';

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return fail('Phiên đăng nhập đã hết.', 401);

  let body: { response?: RegistrationResponseJSON; deviceName?: string };
  try {
    body = await request.json();
  } catch {
    return fail('Dữ liệu gửi lên không hợp lệ.');
  }
  if (!body.response) return fail('Thiếu dữ liệu Face ID.');

  const expectedChallenge = await consumeChallenge('register', user.id);
  if (!expectedChallenge) return fail('Yêu cầu đã hết hạn, bấm bật lại nhé.');

  const { rpID, origin } = relyingParty(request);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return fail('Không xác minh được Face ID trên máy này.');
  }

  if (!verification.verified) return fail('Không xác minh được Face ID trên máy này.');

  const { credential } = verification.registrationInfo;
  const deviceName = String(body.deviceName ?? '').trim().slice(0, 40) || 'Thiết bị';

  const supabase = await createClient();
  const { error } = await supabase.from('passkeys').insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: toBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    device_name: deviceName,
  });

  if (error) {
    return fail(
      error.code === '23505' ? 'Máy này đã bật Face ID rồi.' : 'Không lưu được Face ID, thử lại nhé.',
      error.code === '23505' ? 409 : 500,
    );
  }

  return NextResponse.json({ ok: true });
}
