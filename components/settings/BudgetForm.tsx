'use client';

import { useActionState, useState } from 'react';
import Button from '@/components/ui/Button';
import { saveBudgets, type ActionState } from '@/app/(dashboard)/settings/actions';
import { formatNumber, formatVND, parseAmountInput } from '@/lib/formatters';
import type { Category, Wallet } from '@/types';

const INITIAL: ActionState = { error: null, ok: false };

export interface BudgetRow {
  categoryId: string;
  limit: number;
  spent: number;
}

interface BudgetFormProps {
  wallets: Pick<Wallet, 'id' | 'name' | 'type'>[];
  categories: Category[];
  /** Keyed by `${walletId}:${categoryId}`. */
  rows: Record<string, BudgetRow>;
}

export default function BudgetForm({ wallets, categories, rows }: BudgetFormProps) {
  const [state, formAction, pending] = useActionState(saveBudgets, INITIAL);
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '');
  const [open, setOpen] = useState(false);

  if (wallets.length === 0) {
    return <p className="card text-sm text-muted">Chưa có ví nào để đặt hạn mức.</p>;
  }

  // Twelve categories with inputs and progress bars is most of a screen, and
  // limits are set once and then left alone, so the card stays shut until asked.
  if (!open) {
    const set = categories.filter((c) => (rows[`${walletId}:${c.id}`]?.limit ?? 0) > 0);
    const over = set.filter((c) => {
      const row = rows[`${walletId}:${c.id}`];
      return row && row.spent > row.limit;
    });

    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card tap flex w-full items-center gap-3 text-left"
      >
        <span aria-hidden className="text-2xl">
          🎯
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Hạn mức tháng</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {set.length === 0
              ? 'Chưa đặt hạn mức nào · chạm để đặt'
              : `${set.length}/${categories.length} danh mục đã đặt`}
            {over.length > 0 && (
              <span className="font-medium text-expense"> · {over.length} khoản vượt</span>
            )}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          ›
        </span>
      </button>
    );
  }

  return (
    <form action={formAction} className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Hạn mức tháng</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap -mr-2 flex h-11 w-11 items-center justify-center rounded-2xl text-muted"
          aria-label="Thu gọn hạn mức"
        >
          ⌃
        </button>
      </div>
      <input type="hidden" name="wallet_id" value={walletId} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            type="button"
            onClick={() => setWalletId(wallet.id)}
            aria-pressed={walletId === wallet.id}
            className={`tap min-h-[40px] shrink-0 rounded-xl border px-3 text-xs font-medium ${
              walletId === wallet.id
                ? 'border-brand bg-brand/10 text-brand-strong'
                : 'border-border bg-bg text-muted'
            }`}
          >
            {wallet.type === 'shared' ? '👨‍👩‍👧‍👦 ' : '👤 '}
            {wallet.name}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-border">
        {categories.map((category) => (
          <BudgetRowInput
            key={`${walletId}:${category.id}`}
            category={category}
            row={rows[`${walletId}:${category.id}`]}
          />
        ))}
      </ul>

      <p className="text-xs text-muted">Để trống hoặc 0 nghĩa là không đặt hạn mức.</p>

      {state.error && (
        <p role="alert" className="text-sm text-expense">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p role="status" className="text-sm text-income">
          Đã lưu hạn mức.
        </p>
      )}

      <Button type="submit" full disabled={pending}>
        {pending ? 'Đang lưu…' : 'Lưu hạn mức'}
      </Button>
    </form>
  );
}

function BudgetRowInput({ category, row }: { category: Category; row?: BudgetRow }) {
  const [value, setValue] = useState(row?.limit ? formatNumber(row.limit) : '');
  const limit = parseAmountInput(value) ?? 0;
  const spent = row?.spent ?? 0;
  const ratio = limit > 0 ? Math.min(1, spent / limit) : 0;
  const over = limit > 0 && spent > limit;

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="w-6 text-center text-lg">
          {category.icon}
        </span>
        <label htmlFor={`limit_${category.id}`} className="min-w-0 flex-1 truncate text-sm">
          {category.name}
        </label>
        <input
          id={`limit_${category.id}`}
          name={`limit_${category.id}`}
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="tabular w-28 rounded-lg border border-border bg-bg px-2 py-1.5 text-right text-sm outline-none focus:border-brand"
        />
      </div>

      {limit > 0 && (
        <div className="mt-1.5 pl-9">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${category.name}: đã dùng ${Math.round(ratio * 100)}%`}
          >
            <div
              className={`h-full rounded-full ${over ? 'bg-expense' : 'bg-brand'}`}
              style={{ width: `${Math.max(ratio * 100, 2)}%` }}
            />
          </div>
          <p className={`mt-1 text-[11px] ${over ? 'text-expense' : 'text-muted'}`}>
            Đã chi {formatVND(spent)}
            {over ? ` — vượt ${formatVND(spent - limit)}` : ` / ${formatVND(limit)}`}
          </p>
        </div>
      )}
    </li>
  );
}
