import Link from 'next/link';
import QuickInputForm, { type RecentNote } from '@/components/transactions/QuickInputForm';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import type { Category, Wallet } from '@/types';

export const metadata = { title: 'Thêm giao dịch' };

export default async function AddTransactionPage() {
  const supabase = await createClient();
  const session = await readSessionFast();

  const [walletsResult, categoriesResult, recentResult] = await Promise.all([
    // Archived wallets stay out of the picker: hiding one means "stop using it".
    supabase
      .from('wallets')
      .select('*')
      .eq('is_archived', false)
      .order('type', { ascending: true })
      .order('name'),
    supabase.from('categories').select('*').order('kind').order('name'),
    // What this person usually writes, newest first, for one-tap notes.
    supabase
      .from('transactions')
      .select('note,category_id')
      .eq('created_by', session.id ?? '')
      .not('note', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60),
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
        currentUserId={session.id}
        recentNotes={(recentResult.data as RecentNote[] | null) ?? []}
      />
    </div>
  );
}
