import { createClient } from '@/lib/supabase/server';
import { formatVND, monthRange } from '@/lib/formatters';
import type { Wallet } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ví & Quỹ' };

interface WalletBalance {
  wallet_id: string;
  name: string;
  type: Wallet['type'];
  owner_id: string | null;
  balance: number;
}

export default async function WalletsPage() {
  const supabase = await createClient();
  const { from, to } = monthRange();

  const [balancesResult, monthResult] = await Promise.all([
    supabase.from('wallet_balances').select('wallet_id,name,type,owner_id,balance'),
    supabase.from('transactions').select('wallet_id,type,amount').gte('occurred_at', from).lte('occurred_at', to),
  ]);

  if (balancesResult.error?.code === 'PGRST205') {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold">Ví & Quỹ</h1>
        <p className="card text-sm text-muted">
          Thiếu view <code>wallet_balances</code>. Mở Supabase SQL Editor và chạy lại{' '}
          <code>supabase/schema.sql</code>.
        </p>
      </div>
    );
  }

  const balances = (balancesResult.data ?? []) as WalletBalance[];
  const monthRows = (monthResult.data ?? []) as {
    wallet_id: string;
    type: 'income' | 'expense';
    amount: number;
  }[];

  const monthly = new Map<string, { income: number; expense: number }>();
  for (const row of monthRows) {
    const entry = monthly.get(row.wallet_id) ?? { income: 0, expense: 0 };
    if (row.type === 'income') entry.income += Number(row.amount);
    else entry.expense += Number(row.amount);
    monthly.set(row.wallet_id, entry);
  }

  const shared = balances.filter((wallet) => wallet.type === 'shared');
  const personal = balances.filter((wallet) => wallet.type === 'personal');
  const total = balances.reduce((sum, wallet) => sum + Number(wallet.balance), 0);

  return (
    <div className="space-y-5 py-4">
      <header>
        <h1 className="text-2xl font-semibold">Ví & Quỹ</h1>
        <p className="tabular mt-1 text-sm text-muted">Tổng cộng {formatVND(total)}</p>
      </header>

      {shared.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Quỹ gia đình</h2>
          {shared.map((wallet) => (
            <WalletRow key={wallet.wallet_id} wallet={wallet} month={monthly.get(wallet.wallet_id)} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Ví cá nhân</h2>
        {personal.length === 0 ? (
          <p className="card text-sm text-muted">Chưa có ví cá nhân nào.</p>
        ) : (
          personal.map((wallet) => (
            <WalletRow key={wallet.wallet_id} wallet={wallet} month={monthly.get(wallet.wallet_id)} />
          ))
        )}
      </section>

      <p className="text-xs text-muted">
        Ví cá nhân chỉ mình bạn thấy. Quỹ gia đình thì cả nhà cùng xem và ghi được.
      </p>
    </div>
  );
}

function WalletRow({
  wallet,
  month,
}: {
  wallet: WalletBalance;
  month?: { income: number; expense: number };
}) {
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            <span aria-hidden className="mr-1.5">
              {wallet.type === 'shared' ? '👨‍👩‍👧‍👦' : '👤'}
            </span>
            {wallet.name}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {wallet.type === 'shared' ? 'Chung cả nhà' : 'Riêng tư'}
          </p>
        </div>
        <p className="tabular shrink-0 text-lg font-semibold">{formatVND(Number(wallet.balance))}</p>
      </div>

      <dl className="mt-3 flex gap-4 border-t border-border pt-3 text-xs">
        <div className="flex gap-1.5">
          <dt className="text-muted">Thu tháng:</dt>
          <dd className="tabular font-medium text-income">{formatVND(month?.income ?? 0)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">Chi tháng:</dt>
          <dd className="tabular font-medium text-expense">{formatVND(month?.expense ?? 0)}</dd>
        </div>
      </dl>
    </article>
  );
}
