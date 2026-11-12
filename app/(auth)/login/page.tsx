'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AuthError } from '@supabase/supabase-js';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { normalizeUsername, usernameToEmail, validateUsername } from '@/lib/auth';
import { autofillAvailable, loginWithPasskey, passkeyAvailable, wasEnrolled } from '@/lib/passkey-client';

type Mode = 'login' | 'register';
type FaceIdState = 'unavailable' | 'available' | 'enrolled';

/** Only same-site paths: `next` comes from the URL, so it must not send anyone off-site. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
}

/** A friendly default so most of the household never has to type the display
 * name separately — "bo" becomes "Bo", still free to edit before submitting. */
function suggestDisplayName(rawUsername: string): string {
  const trimmed = rawUsername.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : '';
}

/**
 * Accounts are keyed by a synthetic address built from the username, so
 * Supabase's email-flavoured errors have to be retold in username terms.
 */
function authMessage(error: AuthError, fallback: string): string {
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'Tên đăng nhập này đã có người dùng, chọn tên khác nhé.';
    case 'invalid_credentials':
      return 'Tên đăng nhập hoặc mật khẩu không đúng.';
    case 'email_provider_disabled':
      return 'Supabase đang tắt provider Email. Bật lại trong Authentication → Sign In / Providers → Email.';
    case 'signup_disabled':
      return 'Dự án Supabase đang tắt đăng ký tài khoản mới.';
    case 'weak_password':
      return 'Mật khẩu quá yếu, thử thêm chữ hoa và số.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Supabase đang giới hạn số lần thử. Chờ một lát rồi thử lại.';
    case 'email_address_invalid':
      return 'Tên đăng nhập này Supabase không chấp nhận, thử tên khác.';
    default:
      return fallback;
  }
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-safe-t pb-safe-b">
      <header className="mb-8 flex justify-center">
        {/* The logo file's own backdrop is the page colour (#fefcf5), so it
            drops straight onto the page with no card or edge around it. Its
            baked-in tagline replaces the separate "Chi tiêu của nhà mình" line. */}
        <Image
          src="/brand/logo.png"
          alt="Cơm Áo Gạo Tiền — ứng dụng quản lý thu chi gia đình"
          width={685}
          height={418}
          priority
          sizes="(max-width: 480px) 75vw, 320px"
          className="h-auto w-[min(75vw,320px)]"
        />
      </header>

      <Suspense fallback={<div className="h-[320px]" />}>
        <AuthForm />
      </Suspense>
    </div>
  );
}

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const expired = params.get('reason') === 'expired';

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  // Stops the username -> display name sync the moment the person edits the
  // display name themselves, so a deliberate choice is never overwritten.
  const [displayNameEdited, setDisplayNameEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [faceId, setFaceId] = useState<FaceIdState>('unavailable');
  const [faceIdPending, setFaceIdPending] = useState(false);
  const autofillStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void passkeyAvailable().then((available) => {
      if (!cancelled && available) setFaceId(wasEnrolled() ? 'enrolled' : 'available');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The quiet path: tapping the username field offers the saved passkey in the
  // keyboard bar, the way iOS offers saved passwords. Started once; pressing
  // the Face ID button cancels it and takes over.
  useEffect(() => {
    if (mode !== 'login' || faceId === 'unavailable' || autofillStarted.current) return;
    autofillStarted.current = true;
    void (async () => {
      if (!(await autofillAvailable())) return;
      const result = await loginWithPasskey(true);
      if (result.ok) finish();
    })();
    // finish only navigates; it must not restart the autofill request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, faceId]);

  function finish() {
    router.replace(next);
    router.refresh();
  }

  function switchMode(target: Mode) {
    setMode(target);
    setError(null);
  }

  async function handleFaceId() {
    setError(null);
    setFaceIdPending(true);
    const result = await loginWithPasskey(false);
    if (result.ok) {
      finish();
      return;
    }
    setFaceIdPending(false);
    if (!result.cancelled) setError(result.error);
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });

    if (signInError) {
      setError(authMessage(signInError, 'Tên đăng nhập hoặc mật khẩu không đúng.'));
      setPending(false);
      return;
    }

    finish();
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const usernameProblem = validateUsername(username);
    if (usernameProblem) {
      setError(usernameProblem);
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { display_name: displayName.trim() || normalizeUsername(username) } },
    });

    if (signUpError) {
      setError(authMessage(signUpError, 'Không tạo được tài khoản, thử lại sau.'));
      setPending(false);
      return;
    }

    // With email confirmation off Supabase signs the account in immediately, so
    // there is no pending-confirmation state to handle.
    finish();
  }

  const faceIdButton = (
    <Button
      type="button"
      variant={faceId === 'enrolled' ? 'primary' : 'secondary'}
      full
      disabled={faceIdPending || pending}
      onClick={() => void handleFaceId()}
    >
      <FaceIdGlyph />
      {faceIdPending ? 'Đang xác thực…' : 'Đăng nhập bằng Face ID'}
    </Button>
  );

  return (
    <div className="space-y-5">
      {expired && (
        <p
          role="status"
          className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-fg"
        >
          Phiên đăng nhập đã hết hạn. Vì lý do bảo mật, bạn cần đăng nhập lại.
        </p>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 ring-1 ring-border">
        <button
          type="button"
          onClick={() => switchMode('login')}
          aria-pressed={mode === 'login'}
          className={`tap min-h-[44px] rounded-lg text-sm font-medium ${
            mode === 'login' ? 'bg-brand text-brand-ink' : 'text-muted'
          }`}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => switchMode('register')}
          aria-pressed={mode === 'register'}
          className={`tap min-h-[44px] rounded-lg text-sm font-medium ${
            mode === 'register' ? 'bg-brand text-brand-ink' : 'text-muted'
          }`}
        >
          Đăng ký
        </button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-3">
          {/* Someone who set Face ID up on this phone gets it first; the
              password form stays right below for everyone else. */}
          {faceId === 'enrolled' && (
            <>
              {faceIdButton}
              <Divider />
            </>
          )}

          <Input
            label="Tên đăng nhập"
            name="username"
            type="text"
            // "webauthn" lets iOS offer the saved passkey in the keyboard bar.
            autoComplete="username webauthn"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}

          <Button type="submit" full disabled={pending || faceIdPending}>
            {pending ? 'Đang vào…' : 'Đăng nhập'}
          </Button>

          {faceId === 'available' && (
            <>
              <Divider />
              {faceIdButton}
              <p className="text-center text-xs text-muted">
                Chưa bật Face ID? Đăng nhập bằng mật khẩu một lần, rồi bật trong Cài đặt.
              </p>
            </>
          )}
        </form>
      ) : (
        <form onSubmit={handleRegister} className="space-y-3">
          <Input
            label="Tên đăng nhập"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="bo, me, ti, be…"
            hint="Chữ thường, số, dấu chấm hoặc gạch. Từ 3 ký tự."
            value={username}
            onChange={(event) => {
              const value = event.target.value;
              setUsername(value);
              if (!displayNameEdited) setDisplayName(suggestDisplayName(value));
            }}
          />
          <Input
            label="Tên hiển thị"
            name="display_name"
            type="text"
            autoComplete="name"
            maxLength={40}
            placeholder="Bố, Mẹ, Tí, Bé…"
            hint="Tự điền theo tên đăng nhập, sửa thoải mái."
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setDisplayNameEdited(true);
            }}
          />
          <Input
            label="Mật khẩu"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            hint="Ít nhất 6 ký tự."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            label="Nhập lại mật khẩu"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}

          <Button type="submit" full disabled={pending}>
            {pending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
          </Button>
        </form>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div aria-hidden className="flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-border" />
      hoặc
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function FaceIdGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5a3.5 3.5 0 0 0 5 0" />
    </svg>
  );
}
