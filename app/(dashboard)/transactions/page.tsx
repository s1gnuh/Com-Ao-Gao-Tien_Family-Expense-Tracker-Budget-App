import TransactionCalendar, { type DayTotal } from '@/components/transactions/TransactionCalendar';
import { createClient } from '@/lib/supabase/server';
import { formatMonth, householdParts, toDateInput } from '@/lib/formatters';
import type { TransactionWithRelations, Wallet } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Giao dịch' };

const MONTH_PARAM = /^\d{4}-\d{2}$/;

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

/** Which month to open on: the household's, not the server's. */
function currentMonthKey(): string {
  const { year, month } = householdParts();
  return `${year}-${`${month}`.padStart(2, '0')}`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const params = await searchParams;

  const requested = params.m && MONTH_PARAM.test(params.m) ? params.m : currentMonthKey();
  const [yearText, monthText] = requested.split('-');
  const year = Number(yearText);
  const month = Number(monthText) - 1;

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const from = toDateInput(start);
  const to = toDateInput(end);

  const supabase = await createClient();
  const [walletsResult, transactionsResult, dailyResult] = await Promise.all([
    supabase.from('wallets').select('id,name,type'),
    supabase
      .from('transactions')
      .select(
        'id,wallet_id,created_by,category_id,type,amount,note,occurred_at,source,receipt_url,created_at,' +
          'category:categories(id,name,icon,kind),author:profiles(id,display_name,avatar_emoji)',
      )
      .gte('occurred_at', from)
      .lte('occurred_at', to)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('daily_totals', { p_from: from, p_to: to }),
  ]);

  if (dailyResult.error?.code === 'PGRST202') {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold">Giao dịch</h1>
        <p className="card text-sm text-muted">
          Thiếu hàm <code>daily_totals</code>. Mở Supabase SQL Editor và chạy lại{' '}
          <code>supabase/schema.sql</code>.
        </p>
      </div>
    );
  }

  const wallets = (walletsResult.data ?? []) as Pick<Wallet, 'id' | 'name' | 'type'>[];
  const walletNames = Object.fromEntries(wallets.map((wallet) => [wallet.id, wallet.name]));

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Giao dịch</h1>

      <TransactionCalendar
        monthStart={from}
        monthLabel={formatMonth(start)}
        prevMonth={monthKey(prev)}
        nextMonth={monthKey(next)}
        dailyTotals={(dailyResult.data ?? []) as DayTotal[]}
        transactions={(transactionsResult.data ?? []) as unknown as TransactionWithRelations[]}
        walletNames={walletNames}
      />
    </div>
  );
}
