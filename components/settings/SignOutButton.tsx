'use client';

import { useFormStatus } from 'react-dom';
import { signOutAction } from '@/app/(dashboard)/settings/actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="tap min-h-[48px] w-full rounded-xl border border-border bg-surface font-medium text-expense disabled:opacity-60"
    >
      {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
    </button>
  );
}

/** The tap has to show at once; a plain server form gave no sign it was heard. */
export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Submit />
    </form>
  );
}
