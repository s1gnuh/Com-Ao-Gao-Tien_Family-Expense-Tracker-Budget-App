import Link from 'next/link';
import BillList from '@/components/bills/BillList';
import RefreshButton from '@/components/ui/RefreshButton';
import { createClient } from '@/lib/supabase/server';
import { describeBill, sortBills } from '@/lib/bills';
import type { Category, Profile, RecurringBill, Wallet } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hoá đơn định kỳ' };

export default async function BillsPage() {
  const supabase = await createClient();

  const [billsResult, walletsResult, categoriesResult, membersResult] = await Promise.all([
    supabase.from('recurring_bills').select('*').eq('is_active', true),
    supabase.from('wallets').select('id,name,type').eq('is_archived', false).order('type').order('name'),
    supabase.from('categories').select('*').order('kind').order('name'),
    supabase.from('profiles').select('id,display_name,avatar_emoji').order('display_name'),
  ]);

  if (billsResult.error?.code === 'PGRST205') {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold">Hoá đơn định kỳ</h1>
        <p className="card text-sm text-muted">
          Thiếu bảng <code>recurring_bills</code>. Mở Supabase SQL Editor và chạy lại{' '}
          <code>supabase/schema.sql</code>.
        </p>
      </div>
    );
  }

  const bills = (billsResult.data ?? []) as RecurringBill[];
  const wallets = (walletsResult.data ?? []) as Pick<Wallet, 'id' | 'name' | 'type'>[];
  const walletNames = Object.fromEntries(wallets.map((wallet) => [wallet.id, wallet.name]));
  const described = sortBills(bills.map((bill) => describeBill(bill)));

  const needsAttention = described.filter(
    (entry) => entry.status === 'overdue' || entry.status === 'due_soon',
  ).length;

  return (
    <div className="space-y-5 py-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/wallets" className="tap text-sm text-muted">
            ← Ví & Quỹ
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Hoá đơn định kỳ</h1>
          <p className="mt-0.5 text-sm text-muted">
            {needsAttention > 0
              ? `${needsAttention} khoản cần lo sớm.`
              : 'Chưa có hoá đơn nào đến hạn nha.'}
          </p>
        </div>
        <RefreshButton label="Làm mới danh sách hoá đơn" />
      </header>

      <BillList
        bills={described}
        wallets={wallets}
        categories={(categoriesResult.data ?? []) as Category[]}
        members={(membersResult.data ?? []) as Pick<Profile, 'id' | 'display_name' | 'avatar_emoji'>[]}
        walletNames={walletNames}
      />
    </div>
  );
}
