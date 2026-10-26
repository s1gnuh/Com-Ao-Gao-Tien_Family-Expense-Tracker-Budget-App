import Link from 'next/link';
import QuickInputForm from '@/components/transactions/QuickInputForm';
import { createClient } from '@/lib/supabase/server';
import type { Category, Wallet } from '@/types';

export const metadata = { title: 'Thêm giao dịch' };

export default async function AddTransactionPage() {
  const supabase = await createClient();

  const [walletsResult, categoriesResult] = await Promise.all([
    supabase.from('wallets').select('*').order('type', { ascending: true }).order('name'),
    supabase.from('categories').select('*').order('kind').order('name'),
  ]);

  return (
    <div className="space-y-5 py-4">
      <header className="flex items-center gap-3">
        <Link href="/transactions" aria-label="Quay lại" className="tap text-xl text-muted">
          ←
        </Link>
        <h1 className="text-2xl font-semibold">Thêm giao dịch</h1>
      </header>

      <QuickInputForm
        wallets={(walletsResult.data as Wallet[] | null) ?? []}
        categories={(categoriesResult.data as Category[] | null) ?? []}
      />
    </div>
  );
}
