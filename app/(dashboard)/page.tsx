import Image from 'next/image';
import Link from 'next/link';
import BalanceCard from '@/components/dashboard/BalanceCard';
import CashFlowChart, { type CashFlowPoint } from '@/components/dashboard/CashFlowChart';
import { createClient } from '@/lib/supabase/server';
import { formatMonth, formatVND } from '@/lib/formatters';
import type { Wallet } from '@/types';

export const dynamic = 'force-dynamic';

interface WalletBalance {
  wallet_id: string;
  name: string;
  type: Wallet['type'];
  owner_id: string | null;
  balance: number;
}

interface MonthSlot {
  key: string;
  label: string;
  thu: number;
  chi: number;
}

/** Six slots ending with the current month, oldest first. */
function buildMonthSlots(now: Date): MonthSlot[] {
  const slots: MonthSlot[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    slots.push({
      key: `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`,
      label: `T${date.getMonth() + 1}`,
      thu: 0,
      chi: 0,
    });
  }
  return slots;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();

  const [balancesResult, cashflowResult] = await Promise.all([
    supabase.from('wallet_balances').select('wallet_id,name,type,owner_id,balance'),
    // Aggregated in Postgres: six rows back instead of six months of transactions.
    supabase.rpc('monthly_cashflow', { p_months: 6 }),
  ]);

  const missing =
    balancesResult.error?.code === 'PGRST205'
      ? 'wallet_balances'
      : cashflowResult.error?.code === 'PGRST202'
        ? 'monthly_cashflow'
        : null;

  if (missing) {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
        <p className="card text-sm text-muted">
          Thiếu <code>{missing}</code> trong cơ sở dữ liệu. Mở Supabase SQL Editor và chạy lại{' '}
          <code>supabase/schema.sql</code>.
        </p>
      </div>
    );
  }

  const balances = (balancesResult.data ?? []) as WalletBalance[];
  const cashflow = (cashflowResult.data ?? []) as {
    month: string;
    income: number;
    expense: number;
  }[];

  const slots = buildMonthSlots(now);
  const byKey = new Map(slots.map((slot) => [slot.key, slot]));

  for (const row of cashflow) {
    const slot = byKey.get(row.month.slice(0, 7));
    if (!slot) continue;
    slot.thu = Number(row.income);
    slot.chi = Number(row.expense);
  }

  const current = slots[slots.length - 1]!;
  const totalBalance = balances.reduce((sum, row) => sum + Number(row.balance), 0);
  const chartData: CashFlowPoint[] = slots.map(({ label, thu, chi }) => ({ label, thu, chi }));

  return (
    <div className="space-y-4 py-4">
      <header className="flex items-center gap-3">
        {/* Decorative: "Tổng quan" is the heading, and the logo's own backdrop
            is the page colour, so its margins vanish into the page. */}
        <Image
          src="/brand/logo.png"
          alt=""
          aria-hidden
          width={685}
          height={418}
          priority
          sizes="96px"
          className="h-12 w-auto shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm capitalize text-muted">{formatMonth(now)}</p>
          <h1 className="text-2xl font-semibold leading-tight">Tổng quan</h1>
        </div>
      </header>

      <BalanceCard
        balance={totalBalance}
        income={current.thu}
        expense={current.chi}
        monthLabel={`T${now.getMonth() + 1}`}
      />

      <CashFlowChart data={chartData} />

      <section className="card" aria-label="Số dư từng ví">
        <h2 className="mb-3 text-sm font-medium">Ví & Quỹ</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-muted">Chưa có ví nào.</p>
        ) : (
          <ul className="space-y-2">
            {balances
              .slice()
              .sort((a, b) => (a.type === b.type ? 0 : a.type === 'shared' ? -1 : 1))
              .map((wallet) => (
                <li key={wallet.wallet_id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm">
                    <span aria-hidden className="mr-1.5">
                      {wallet.type === 'shared' ? '👨‍👩‍👧‍👦' : '👤'}
                    </span>
                    {wallet.name}
                  </span>
                  <span className="tabular shrink-0 text-sm font-medium">
                    {formatVND(Number(wallet.balance))}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <Link
        href="/transactions"
        className="tap block rounded-xl py-3 text-center text-sm font-medium text-brand-strong"
      >
        Xem tất cả giao dịch
      </Link>
    </div>
  );
}
