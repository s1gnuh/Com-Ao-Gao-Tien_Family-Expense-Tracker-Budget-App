'use client';

import { useActionState, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { saveBill, type BillState } from '@/app/(dashboard)/bills/actions';
import { CYCLE_LABEL } from '@/lib/bills';
import { formatNumber, formatVND, parseAmountInput } from '@/lib/formatters';
import type { BillCycle, Category, Profile, RecurringBill, Wallet } from '@/types';

const INITIAL: BillState = { error: null, ok: false };
const CYCLES: BillCycle[] = ['monthly', 'quarterly', 'yearly'];

interface BillFormProps {
  initial?: RecurringBill;
  wallets: Pick<Wallet, 'id' | 'name' | 'type'>[];
  categories: Category[];
  members: Pick<Profile, 'id' | 'display_name' | 'avatar_emoji'>[];
  onDone: () => void;
}

export default function BillForm({
  initial,
  wallets,
  categories,
  members,
  onDone,
}: BillFormProps) {
  const [state, formAction, pending] = useActionState(saveBill, INITIAL);

  const [name, setName] = useState(initial?.name ?? '');
  const [amountRaw, setAmountRaw] = useState(
    initial ? formatNumber(Number(initial.amount)) : '',
  );
  const [cycle, setCycle] = useState<BillCycle>(initial?.cycle ?? 'monthly');
  const [dueDay, setDueDay] = useState(String(initial?.due_day ?? 1));
  const [dueMonth, setDueMonth] = useState(String(initial?.due_month ?? 1));
  const [walletId, setWalletId] = useState(initial?.wallet_id ?? wallets[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [assigneeId, setAssigneeId] = useState(initial?.assignee_id ?? '');

  // The action returns ok rather than redirecting, so the list closes the form.
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const amount = parseAmountInput(amountRaw);

  return (
    <form action={formAction} className="card space-y-4">
      <h2 className="font-semibold">{initial ? 'Sửa hoá đơn' : 'Hoá đơn định kỳ mới'}</h2>

      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="wallet_id" value={walletId} />
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="assignee_id" value={assigneeId} />
      <input type="hidden" name="cycle" value={cycle} />
      <input type="hidden" name="amount" value={amount ?? ''} />

      <Input
        label="Tên hoá đơn"
        name="name"
        type="text"
        required
        maxLength={60}
        placeholder="Tiền điện, Internet, Học phí…"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Số tiền mỗi kỳ</span>
        <input
          type="text"
          inputMode="decimal"
          required
          placeholder="1tr2, 350k…"
          value={amountRaw}
          onChange={(event) => setAmountRaw(event.target.value)}
          className="tabular w-full rounded-2xl border border-border bg-bg px-4 py-3 text-lg font-semibold outline-none focus:border-brand"
        />
        <span className="mt-1.5 block text-xs text-muted">
          {amount === null ? 'Gõ 350k hoặc 1tr2 cũng được' : formatVND(amount)}
        </span>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Chu kỳ</span>
        <div className="grid grid-cols-3 gap-2">
          {CYCLES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCycle(option)}
              aria-pressed={cycle === option}
              className={`tap min-h-[48px] rounded-2xl border text-sm font-medium ${
                cycle === option
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-border bg-bg text-muted'
              }`}
            >
              {CYCLE_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Ngày đến hạn"
          name="due_day"
          type="number"
          min={1}
          max={31}
          required
          hint="Ngày 29–31 sẽ lùi về ngày cuối tháng ngắn."
          value={dueDay}
          onChange={(event) => setDueDay(event.target.value)}
        />
        {cycle === 'monthly' ? (
          <input type="hidden" name="due_month" value="" />
        ) : (
          <Input
            label={cycle === 'quarterly' ? 'Tháng đầu chu kỳ' : 'Tháng đến hạn'}
            name="due_month"
            type="number"
            min={1}
            max={12}
            required
            value={dueMonth}
            onChange={(event) => setDueMonth(event.target.value)}
          />
        )}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Trả từ ví</span>
        <div className="flex flex-wrap gap-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              onClick={() => setWalletId(wallet.id)}
              aria-pressed={walletId === wallet.id}
              className={`tap min-h-[48px] rounded-2xl border px-3 text-sm font-medium ${
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
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Ai lo khoản này</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAssigneeId('')}
            aria-pressed={assigneeId === ''}
            className={`tap min-h-[48px] rounded-2xl border px-3 text-sm font-medium ${
              assigneeId === '' ? 'border-brand bg-brand/10 text-brand-strong' : 'border-border bg-bg text-muted'
            }`}
          >
            Cả nhà
          </button>
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => setAssigneeId(member.id)}
              aria-pressed={assigneeId === member.id}
              className={`tap min-h-[48px] rounded-2xl border px-3 text-sm font-medium ${
                assigneeId === member.id
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-border bg-bg text-muted'
              }`}
            >
              {member.avatar_emoji ?? '🙂'} {member.display_name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Danh mục</span>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id === categoryId ? '' : category.id)}
              aria-pressed={categoryId === category.id}
              className={`tap flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border text-xs ${
                categoryId === category.id
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-border bg-bg text-muted'
              }`}
            >
              <span aria-hidden className="text-xl leading-none">
                {category.icon}
              </span>
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-expense">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onDone}
          className="tap min-h-[48px] rounded-2xl border border-border bg-surface font-medium"
        >
          Huỷ
        </button>
        <Button type="submit" disabled={pending || amount === null}>
          {pending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}
