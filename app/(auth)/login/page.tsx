'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'register';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function switchMode(target: Mode) {
    setMode(target);
    setError(null);
    setNotice(null);
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('Email hoặc mật khẩu không đúng.');
      setPending(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

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
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() || email.split('@')[0] } },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes('already registered')
          ? 'Email này đã có tài khoản, thử đăng nhập nhé.'
          : 'Không tạo được tài khoản, thử lại sau.',
      );
      setPending(false);
      return;
    }

    // Email confirmation is on: Supabase returns a user but no session yet.
    if (!data.session) {
      setNotice('Đã gửi email xác nhận. Kiểm tra hộp thư rồi quay lại đăng nhập nhé.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      setPending(false);
      return;
    }

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

      {notice && (
        <p role="status" className="rounded-xl bg-brand/10 p-3 text-sm text-brand">
          {notice}
        </p>
      )}

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-3">
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label="Mật khẩu"
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
            label="Tên hiển thị"
            type="text"
            autoComplete="name"
            maxLength={40}
            placeholder="Bố, Mẹ, Tí, Bé…"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label="Mật khẩu"
            type="password"
            autoComplete="new-password"
            required
            hint="Ít nhất 6 ký tự."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            label="Nhập lại mật khẩu"
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
