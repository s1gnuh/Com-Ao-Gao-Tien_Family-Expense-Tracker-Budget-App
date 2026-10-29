import Image from 'next/image';
import Link from 'next/link';
import BalanceCard from '@/components/dashboard/BalanceCard';
import CashFlowChart, { type CashFlowPoint } from '@/components/dashboard/CashFlowChart';
import MemberBreakdown, { type MemberRow } from '@/components/dashboard/MemberBreakdown';
import RefreshButton from '@/components/ui/RefreshButton';
import { createClient } from '@/lib/supabase/server';
import { describeBill, sortBills } from '@/lib/bills';
import { formatMonth, formatVND, householdParts, monthRange } from '@/lib/formatters';
import type { RecurringBill, Wallet } from '@/types';

export const dynamic = 'force-dynamic';

interface WalletBalance {
  wallet_id: string;
  name: string;
  type: Wallet['type'];
  owner_id: string | null;
  is_archived: boolean;
  balance: number;
}

interface MonthSlot {
  key: string;
  label: string;
  thu: number;
  chi: number;
}

/**
 * Six slots ending with the household's current month, oldest first. Stepped
 * through Date.UTC so the zone this renders in cannot move the boundary.
 */
function buildMonthSlots(year: number, month: number): MonthSlot[] {
  const slots: MonthSlot[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    slots.push({
      key: `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}`,
      label: `T${date.getUTCMonth() + 1}`,
      thu: 0,
      chi: 0,
    });
  }
  return slots;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { year, month } = householdParts();
  // Noon keeps the label on the right month in any zone the server may run in.
  const monthAnchor = new Date(Date.UTC(year, month - 1, 1, 12));

  const { from, to } = monthRange();

  const [balancesResult, cashflowResult, billsResult, walletMonthResult, memberResult] =
    await Promise.all([
      supabase.from('wallet_balances').select('wallet_id,name,type,owner_id,is_archived,balance'),
      // Aggregated in Postgres: six rows back instead of six months of transactions.
      supabase.rpc('monthly_cashflow', { p_months: 6 }),
      supabase.from('recurring_bills').select('*').eq('is_active', true),
      supabase.rpc('wallet_month_totals', { p_from: from, p_to: to }),
      supabase.rpc('member_breakdown', { p_from: from, p_to: to }),
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

  const slots = buildMonthSlots(year, month);
  const byKey = new Map(slots.map((slot) => [slot.key, slot]));

  for (const row of cashflow) {
    const slot = byKey.get(row.month.slice(0, 7));
    if (!slot) continue;
    slot.thu = Number(row.income);
    slot.chi = Number(row.expense);
  }

  const current = slots[slots.length - 1]!;
  // Archived wallets are left out here exactly as they are on Ví & Quỹ, which
  // shows them in their own section. Counting them in one total and not the
  // other is how the two screens came to disagree.
  const live = balances.filter((row) => !row.is_archived);
  // Only money somebody actually holds. The family fund takes no income by
  // design, so its running total is the household's spending with a minus in
  // front — adding it here would read as everyone's savings shrinking.
  const totalBalance = live
    .filter((row) => row.type === 'personal')
    .reduce((sum, row) => sum + Number(row.balance), 0);
  const chartData: CashFlowPoint[] = slots.map(({ label, thu, chi }) => ({ label, thu, chi }));

  const monthByWallet = new Map(
    ((walletMonthResult.data ?? []) as { wallet_id: string; expense: number }[]).map((row) => [
      row.wallet_id,
      Number(row.expense),
    ]),
  );

  // A missing recurring_bills table just means the badge stays quiet.
  const pendingBills = sortBills(
    ((billsResult.data ?? []) as RecurringBill[]).map((bill) => describeBill(bill)),
  ).filter((entry) => entry.status === 'overdue' || entry.status === 'due_soon');

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
        <div className="min-w-0 flex-1">
          <p className="text-sm capitalize text-muted">{formatMonth(monthAnchor)}</p>
          <h1 className="text-2xl font-semibold leading-tight">Tổng quan</h1>
        </div>
        <RefreshButton />
      </header>

      {pendingBills.length > 0 && (
        <Link
          href="/bills"
          className="tap flex items-center gap-3 rounded-card border border-expense/30 bg-expense/10 p-4"
        >
          <span aria-hidden className="text-xl">
            🔔
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-expense">
              {pendingBills.length} hoá đơn cần lo sớm
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              Gần nhất: {pendingBills[0]!.bill.name} ·{' '}
              {pendingBills[0]!.status === 'overdue'
                ? `quá hạn ${Math.abs(pendingBills[0]!.daysLeft)} ngày`
                : pendingBills[0]!.daysLeft === 0
                  ? 'đến hạn hôm nay'
                  : `còn ${pendingBills[0]!.daysLeft} ngày`}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-expense">
            ›
          </span>
        </Link>
      )}

      <BalanceCard
        balance={totalBalance}
        income={current.thu}
        expense={current.chi}
        monthLabel={`T${month}`}
      />

      <CashFlowChart data={chartData} />

      {/* Absent until the project has run the latest schema.sql, in which case
          the card stays away rather than the whole page failing. */}
      {!memberResult.error && (
        <MemberBreakdown
          rows={(memberResult.data ?? []) as MemberRow[]}
          monthLabel={`T${month}`}
        />
      )}

      <section className="card" aria-label="Số dư từng ví">
        <h2 className="mb-3 text-sm font-medium">Ví & Quỹ</h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted">Chưa có ví nào.</p>
        ) : (
          <ul className="space-y-2">
            {live
              .slice()
              .sort((a, b) => (a.type === b.type ? 0 : a.type === 'shared' ? -1 : 1))
              .map((wallet) => (
                <li key={wallet.wallet_id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">
                    <span aria-hidden className="mr-1.5">
                      {wallet.type === 'shared' ? '👨‍👩‍👧‍👦' : '👤'}
                    </span>
                    {wallet.name}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block text-sm font-medium">
                      {formatVND(
                        wallet.type === 'shared'
                          ? (monthByWallet.get(wallet.wallet_id) ?? 0)
                          : Number(wallet.balance),
                      )}
                    </span>
                    {wallet.type === 'shared' && (
                      <span className="block text-[11px] text-muted">chi T{month}</span>
                    )}
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
