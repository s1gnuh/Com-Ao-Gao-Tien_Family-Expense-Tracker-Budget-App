import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { createServiceClient } from '@/lib/supabase/server';
import { consumeChallenge, fromBase64Url, relyingParty, signInAs } from '@/lib/webauthn';

export const runtime = 'nodejs';

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  let body: { response?: AuthenticationResponseJSON };
  try {
    body = await request.json();
  } catch {
    return fail('Dữ liệu gửi lên không hợp lệ.');
  }
  const response = body.response;
  if (!response?.id) return fail('Thiếu dữ liệu Face ID.');

  // Consumed before anything else, so a failed attempt cannot be retried with
  // the same challenge either.
  const expectedChallenge = await consumeChallenge('login', null);
  if (!expectedChallenge) return fail('Yêu cầu đã hết hạn, thử lại nhé.');

  const service = createServiceClient();
  const { data: passkey } = await service
    .from('passkeys')
    .select('id,user_id,credential_id,public_key,counter,transports')
    .eq('credential_id', response.id)
    .maybeSingle();

  // The phone offered a passkey this site no longer knows: removed in Settings,
  // or made for an account that was deleted.
  if (!passkey) {
    return fail('Face ID trên máy này đã bị gỡ. Đăng nhập bằng mật khẩu rồi bật lại trong Cài đặt.', 404);
  }

  const { rpID, origin } = relyingParty(request);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credential_id as string,
        publicKey: fromBase64Url(passkey.public_key as string),
        counter: Number(passkey.counter),
        transports: (passkey.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
    });
  } catch {
    return fail('Không xác minh được Face ID.', 401);
  }

  if (!verification.verified) return fail('Không xác minh được Face ID.', 401);

  await service
    .from('passkeys')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', passkey.id);

  const signedIn = await signInAs(passkey.user_id as string);
  if (!signedIn) return fail('Xác minh được Face ID nhưng không mở được phiên, thử lại nhé.', 500);

  return NextResponse.json({ ok: true });
}
