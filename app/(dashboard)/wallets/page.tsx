import Link from 'next/link';
import { AddWalletCard, WalletCard, type WalletCardData } from '@/components/wallets/WalletManager';
import RefreshButton from '@/components/ui/RefreshButton';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import { describeBill, sortBills } from '@/lib/bills';
import { formatVND, monthRange } from '@/lib/formatters';
import type { RecurringBill, Wallet } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ví & Quỹ' };

interface WalletBalance {
  wallet_id: string;
  name: string;
  type: Wallet['type'];
  owner_id: string | null;
  is_archived: boolean;
  balance: number;
}

export default async function WalletsPage() {
  const supabase = await createClient();
  const session = await readSessionFast();
  const { from, to } = monthRange();

  const [balancesResult, monthResult, billsResult] = await Promise.all([
    supabase.from('wallet_balances').select('wallet_id,name,type,owner_id,is_archived,balance'),
    supabase
      .from('transactions')
      .select('wallet_id,type,amount')
      .gte('occurred_at', from)
      .lte('occurred_at', to),
    supabase.from('recurring_bills').select('*').eq('is_active', true),
  ]);

  if (balancesResult.error) {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold">Ví & Quỹ</h1>
        <p className="card text-sm text-muted">
          Thiếu cột hoặc view mới trong cơ sở dữ liệu. Mở Supabase SQL Editor và chạy lại{' '}
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

  const toCard = (wallet: WalletBalance): WalletCardData => ({
    ...wallet,
    balance: Number(wallet.balance),
    month: monthly.get(wallet.wallet_id),
    // The family fund is managed by everyone; a personal wallet by its owner.
    manageable: wallet.type === 'shared' || wallet.owner_id === session.id,
  });

  const live = balances.filter((wallet) => !wallet.is_archived);
  const shared = live.filter((wallet) => wallet.type === 'shared');
  const personal = live.filter((wallet) => wallet.type === 'personal');
  const archived = balances.filter((wallet) => wallet.is_archived);
  const total = live.reduce((sum, wallet) => sum + Number(wallet.balance), 0);

  const bills = sortBills(
    ((billsResult.data ?? []) as RecurringBill[]).map((bill) => describeBill(bill)),
  );
  const pending = bills.filter(
    (entry) => entry.status === 'overdue' || entry.status === 'due_soon',
  );

  return (
    <div className="space-y-5 py-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Ví & Quỹ</h1>
          <p className="tabular mt-0.5 text-sm text-muted">Tổng cộng {formatVND(total)}</p>
        </div>
        <RefreshButton label="Làm mới số dư ví" />
      </header>

      <Link
        href="/bills"
        className="tap flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
      >
        <span className="min-w-0">
          <span className="block font-semibold">Hoá đơn định kỳ</span>
          <span className="mt-0.5 block text-xs text-muted">
            {pending.length > 0
              ? `${pending.length} khoản cần lo sớm · gần nhất: ${pending[0]!.bill.name}`
              : 'Chưa có hoá đơn nào đến hạn nha'}
          </span>
        </span>
        {pending.length > 0 && (
          <span className="shrink-0 rounded-full bg-expense px-2.5 py-1 text-xs font-bold text-on-money">
            {pending.length}
          </span>
        )}
        <span aria-hidden className="shrink-0 text-muted">
          ›
        </span>
      </Link>

      {shared.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Quỹ gia đình</h2>
          {shared.map((wallet) => (
            <WalletCard key={wallet.wallet_id} data={toCard(wallet)} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Ví cá nhân</h2>
        {personal.length === 0 ? (
          <p className="card text-sm text-muted">Chưa có ví cá nhân nào.</p>
        ) : (
          personal.map((wallet) => <WalletCard key={wallet.wallet_id} data={toCard(wallet)} />)
        )}
        <AddWalletCard />
      </section>

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Ví đang ẩn</h2>
          {archived.map((wallet) => (
            <WalletCard key={wallet.wallet_id} data={toCard(wallet)} />
          ))}
        </section>
      )}

      <p className="text-xs text-muted">
        Ví cá nhân chỉ mình bạn thấy. Quỹ gia đình thì cả nhà cùng xem và ghi được. Ẩn ví sẽ giữ
        nguyên giao dịch cũ.
      </p>
    </div>
  );
}
