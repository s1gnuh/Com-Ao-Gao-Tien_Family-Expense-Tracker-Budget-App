'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-safe-t pb-safe-b">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold">Cơm Áo Gạo Tiền</h1>
        <p className="mt-1 text-sm text-muted">Chi tiêu của nhà mình</p>
      </header>

      <Suspense fallback={<div className="h-[172px]" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
      />
      <input
        type="password"
        autoComplete="current-password"
        required
        placeholder="Mật khẩu"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
      />

      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="tap min-h-[48px] w-full rounded-xl bg-brand font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Đang vào…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
