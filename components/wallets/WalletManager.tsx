'use client';

import { useActionState, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  archiveWallet,
  createWallet,
  renameWallet,
  restoreWallet,
  type WalletState,
} from '@/app/(dashboard)/wallets/actions';
import { formatVND } from '@/lib/formatters';
import type { Wallet } from '@/types';

const INITIAL: WalletState = { error: null, ok: false };

export interface WalletCardData {
  wallet_id: string;
  name: string;
  type: Wallet['type'];
  owner_id: string | null;
  is_archived: boolean;
  balance: number;
  month?: { income: number; expense: number };
  /** Only the owner may rename or hide a personal wallet. */
  manageable: boolean;
}

export function WalletCard({ data }: { data: WalletCardData }) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [renameState, renameAction, renamingBusy] = useActionState(renameWallet, INITIAL);
  const [archiveState, archiveAction, archiving] = useActionState(archiveWallet, INITIAL);
  const [restoreState, restoreAction, restoring] = useActionState(restoreWallet, INITIAL);

  useEffect(() => {
    if (renameState.ok) setRenaming(false);
  }, [renameState.ok]);
  useEffect(() => {
    if (archiveState.ok) setConfirming(false);
  }, [archiveState.ok]);

  const error = renameState.error ?? archiveState.error ?? restoreState.error;

  if (renaming) {
    return (
      <form action={renameAction} className="card space-y-3">
        <input type="hidden" name="id" value={data.wallet_id} />
        <Input
          label="Tên ví"
          name="name"
          type="text"
          required
          maxLength={40}
          defaultValue={data.name}
        />
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="tap min-h-[48px] rounded-2xl border border-border bg-surface font-medium"
          >
            Huỷ
          </button>
          <Button type="submit" disabled={renamingBusy}>
            {renamingBusy ? 'Đang lưu…' : 'Lưu tên'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <article className={`card ${data.is_archived ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            <span aria-hidden className="mr-1.5">
              {data.type === 'shared' ? '👨‍👩‍👧‍👦' : '👤'}
            </span>
            {data.name}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {data.is_archived
              ? 'Đang ẩn'
              : data.type === 'shared'
                ? 'Chung cả nhà'
                : 'Riêng tư'}
          </p>
        </div>
        {/* The fund never takes money in, so its running total is spending with
            a minus in front. Showing that as a balance read as debt; what the
            household actually watches is the month's spend. */}
        <div className="shrink-0 text-right">
          <p className="tabular text-lg font-semibold">
            {data.type === 'shared'
              ? formatVND(data.month?.expense ?? 0)
              : formatVND(Number(data.balance))}
          </p>
          {data.type === 'shared' && <p className="text-[11px] text-muted">chi tháng này</p>}
        </div>
      </div>

      {data.month && !data.is_archived && (
        <dl className="mt-3 flex gap-4 border-t border-border pt-3 text-xs">
          {data.type === 'shared' ? (
            <div className="flex gap-1.5">
              <dt className="text-muted">Tổng chi từ trước:</dt>
              <dd className="tabular font-medium text-expense">
                {formatVND(Math.max(0, -Number(data.balance)))}
              </dd>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5">
                <dt className="text-muted">Thu tháng:</dt>
                <dd className="tabular font-medium text-income">{formatVND(data.month.income)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Chi tháng:</dt>
                <dd className="tabular font-medium text-expense">
                  {formatVND(data.month.expense)}
                </dd>
              </div>
            </>
          )}
        </dl>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-expense">
          {error}
        </p>
      )}

      {data.manageable && (
        <div className="mt-3">
          {data.is_archived ? (
            <form action={restoreAction}>
              <input type="hidden" name="id" value={data.wallet_id} />
              <button
                type="submit"
                disabled={restoring}
                className="tap min-h-[48px] w-full rounded-2xl border border-border bg-surface text-sm font-medium"
              >
                {restoring ? 'Đang mở lại…' : 'Dùng lại ví này'}
              </button>
            </form>
          ) : confirming ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Ẩn ví “{data.name}”? Giao dịch cũ vẫn được giữ nguyên.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="tap min-h-[48px] rounded-2xl border border-border bg-surface text-sm font-medium"
                >
                  Giữ lại
                </button>
                <form action={archiveAction}>
                  <input type="hidden" name="id" value={data.wallet_id} />
                  <button
                    type="submit"
                    disabled={archiving}
                    className="tap min-h-[48px] w-full rounded-2xl bg-expense text-sm font-semibold text-on-money disabled:opacity-60"
                  >
                    {archiving ? 'Đang ẩn…' : 'Ẩn ví'}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="tap min-h-[48px] rounded-2xl border border-border bg-surface text-sm font-medium"
              >
                Đổi tên
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="tap min-h-[48px] rounded-2xl border border-border bg-surface text-sm font-medium text-expense"
              >
                Ẩn ví
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function AddWalletCard() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createWallet, INITIAL);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  if (!open) {
    return (
      <Button type="button" full variant="secondary" onClick={() => setOpen(true)}>
        + Thêm ví cá nhân
      </Button>
    );
  }

  return (
    <form action={formAction} className="card space-y-3">
      <Input
        label="Tên ví mới"
        name="name"
        type="text"
        required
        maxLength={40}
        placeholder="Ví tiêu vặt, Quỹ du lịch…"
      />
      {state.error && (
        <p role="alert" className="text-sm text-expense">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap min-h-[48px] rounded-2xl border border-border bg-surface font-medium"
        >
          Huỷ
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Đang tạo…' : 'Tạo ví'}
        </Button>
      </div>
    </form>
  );
}
