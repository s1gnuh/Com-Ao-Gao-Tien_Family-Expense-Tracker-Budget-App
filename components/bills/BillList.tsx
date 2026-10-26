'use client';

import { useActionState, useState } from 'react';
import Button from '@/components/ui/Button';
import BillForm from './BillForm';
import { markBillPaid, deleteBill, type BillState } from '@/app/(dashboard)/bills/actions';
import { CYCLE_LABEL, STATUS_LABEL } from '@/lib/bills';
import { formatDate, formatVND } from '@/lib/formatters';
import type { BillStatus, BillWithStatus, Category, Profile, Wallet } from '@/types';

const INITIAL: BillState = { error: null, ok: false };

const TONE: Record<BillStatus, string> = {
  overdue: 'bg-expense/10 text-expense',
  due_soon: 'bg-brand/15 text-brand-strong',
  upcoming: 'bg-bg text-muted',
  paid: 'bg-income/10 text-income',
};

interface BillListProps {
  bills: BillWithStatus[];
  wallets: Pick<Wallet, 'id' | 'name' | 'type'>[];
  categories: Category[];
  members: Pick<Profile, 'id' | 'display_name' | 'avatar_emoji'>[];
  walletNames: Record<string, string>;
}

export default function BillList({
  bills,
  wallets,
  categories,
  members,
  walletNames,
}: BillListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <BillForm
        wallets={wallets}
        categories={categories}
        members={members}
        onDone={() => setAdding(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Button type="button" full onClick={() => setAdding(true)}>
        + Thêm hoá đơn định kỳ
      </Button>

      {bills.length === 0 ? (
        <p className="card text-center text-sm text-muted">
          Chưa có hoá đơn nào đến hạn nha. Thêm tiền nhà, điện, nước… để khỏi quên.
        </p>
      ) : (
        <ul className="space-y-3">
          {bills.map((entry) =>
            editing === entry.bill.id ? (
              <li key={entry.bill.id}>
                <BillForm
                  initial={entry.bill}
                  wallets={wallets}
                  categories={categories}
                  members={members}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <BillRow
                key={entry.bill.id}
                entry={entry}
                walletName={walletNames[entry.bill.wallet_id]}
                assignee={members.find((m) => m.id === entry.bill.assignee_id)}
                onEdit={() => setEditing(entry.bill.id)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function BillRow({
  entry,
  walletName,
  assignee,
  onEdit,
}: {
  entry: BillWithStatus;
  walletName?: string;
  assignee?: Pick<Profile, 'id' | 'display_name' | 'avatar_emoji'>;
  onEdit: () => void;
}) {
  const [payState, payAction, paying] = useActionState(markBillPaid, INITIAL);
  const [deleteState, deleteAction, deleting] = useActionState(deleteBill, INITIAL);
  const [confirming, setConfirming] = useState(false);

  const { bill, status, dueOn, daysLeft } = entry;

  const when =
    status === 'overdue'
      ? `Quá hạn ${Math.abs(daysLeft)} ngày (${formatDate(dueOn)})`
      : daysLeft === 0
        ? `Đến hạn hôm nay (${formatDate(dueOn)})`
        : `Còn ${daysLeft} ngày — ${formatDate(dueOn)}`;

  return (
    <li className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{bill.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {[CYCLE_LABEL[bill.cycle], walletName, assignee?.display_name]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <p className="tabular shrink-0 font-semibold">{formatVND(Number(bill.amount))}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        <span className="truncate text-xs text-muted">{when}</span>
      </div>

      {(payState.error ?? deleteState.error) && (
        <p role="alert" className="text-xs text-expense">
          {payState.error ?? deleteState.error}
        </p>
      )}

      {confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">Xoá hẳn hoá đơn “{bill.name}”?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="tap min-h-[48px] rounded-2xl border border-border bg-surface text-sm font-medium"
            >
              Giữ lại
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={bill.id} />
              <button
                type="submit"
                disabled={deleting}
                className="tap min-h-[48px] w-full rounded-2xl bg-expense text-sm font-semibold text-on-money disabled:opacity-60"
              >
                {deleting ? 'Đang xoá…' : 'Xoá hẳn'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <form action={payAction}>
            <input type="hidden" name="id" value={bill.id} />
            <button
              type="submit"
              disabled={paying || status === 'paid'}
              className="tap min-h-[48px] w-full rounded-2xl bg-income text-sm font-semibold text-on-money disabled:opacity-40"
            >
              {paying ? '…' : 'Đã đóng'}
            </button>
          </form>
          <button
            type="button"
            onClick={onEdit}
            className="tap min-h-[48px] rounded-2xl border border-border bg-surface text-sm font-medium"
          >
            Sửa
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="tap min-h-[48px] rounded-2xl border border-border bg-surface text-sm font-medium text-expense"
          >
            Xoá
          </button>
        </div>
      )}
    </li>
  );
}
