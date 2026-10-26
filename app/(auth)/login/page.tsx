'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AuthError } from '@supabase/supabase-js';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { normalizeUsername, usernameToEmail, validateUsername } from '@/lib/auth';

type Mode = 'login' | 'register';

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
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold">Cơm Áo Gạo Tiền</h1>
        <p className="mt-1 text-sm text-muted">Chi tiêu của nhà mình</p>
      </header>

      <Suspense fallback={<div className="h-[320px]" />}>
        <AuthForm />
      </Suspense>
    </div>
  );
}

function AuthForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function switchMode(target: Mode) {
    setMode(target);
    setError(null);
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

    router.replace(next);
    router.refresh();
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
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 ring-1 ring-border">
        <button
          type="button"
          onClick={() => switchMode('login')}
          aria-pressed={mode === 'login'}
          className={`tap min-h-[44px] rounded-lg text-sm font-medium ${
            mode === 'login' ? 'bg-brand text-white' : 'text-muted'
          }`}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => switchMode('register')}
          aria-pressed={mode === 'register'}
          className={`tap min-h-[44px] rounded-lg text-sm font-medium ${
            mode === 'register' ? 'bg-brand text-white' : 'text-muted'
          }`}
        >
          Đăng ký
        </button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-3">
          <Input
            label="Tên đăng nhập"
            name="username"
            type="text"
            autoComplete="username"
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

          <Button type="submit" full disabled={pending}>
            {pending ? 'Đang vào…' : 'Đăng nhập'}
          </Button>
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
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            label="Tên hiển thị"
            name="display_name"
            type="text"
            autoComplete="name"
            maxLength={40}
            placeholder="Bố, Mẹ, Tí, Bé…"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
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
