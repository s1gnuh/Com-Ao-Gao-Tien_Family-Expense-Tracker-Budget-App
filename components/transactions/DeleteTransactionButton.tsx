'use client';

import { useActionState, useState } from 'react';
import { deleteTransaction, type EditTransactionState } from '@/app/(dashboard)/transactions/[id]/actions';

const INITIAL: EditTransactionState = { error: null };

export default function DeleteTransactionButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteTransaction, INITIAL);
  const [armed, setArmed] = useState(false);

  // Two taps rather than a system confirm dialog: the second tap is a different
  // button in a different colour, so it cannot be hit by muscle memory.
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="tap min-h-[48px] w-full rounded-xl border border-border bg-surface font-medium text-expense"
      >
        Xoá giao dịch
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p role="alert" className="text-center text-sm text-muted">
        Xoá hẳn khoản này? Không khôi phục được.
      </p>

      {state.error && (
        <p role="alert" className="text-center text-sm text-expense">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="tap min-h-[48px] rounded-xl border border-border bg-surface font-medium"
        >
          Giữ lại
        </button>

        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="tap min-h-[48px] w-full rounded-xl bg-expense font-semibold text-on-money disabled:opacity-60"
          >
            {pending ? 'Đang xoá…' : 'Xoá hẳn'}
          </button>
        </form>
      </div>
    </div>
  );
}
