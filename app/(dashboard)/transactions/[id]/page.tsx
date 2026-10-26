import Link from 'next/link';
import { notFound } from 'next/navigation';
import DeleteTransactionButton from '@/components/transactions/DeleteTransactionButton';
import QuickInputForm, { type EditableTransaction } from '@/components/transactions/QuickInputForm';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import type { Category, Wallet } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sửa giao dịch' };

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await readSessionFast();

  const [transactionResult, walletsResult, categoriesResult] = await Promise.all([
    supabase
      .from('transactions')
      .select('id,wallet_id,category_id,type,amount,note,occurred_at,created_by')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('wallets').select('*').order('type', { ascending: true }).order('name'),
    supabase.from('categories').select('*').order('kind').order('name'),
  ]);

  const row = transactionResult.data as (EditableTransaction & { created_by: string }) | null;
  if (!row) notFound();

  // RLS lets any household member read a shared-wallet row but only its author
  // change it, so say so here rather than letting the save fail later.
  const mine = row.created_by === session.id;

  return (
    <div className="space-y-5 py-4">
      <header className="flex items-center gap-3">
        <Link href="/transactions" aria-label="Quay lại" className="tap text-xl text-muted">
          ←
        </Link>
        <h1 className="text-2xl font-semibold">Sửa giao dịch</h1>
      </header>

      {mine ? (
        <QuickInputForm
          wallets={(walletsResult.data as Wallet[] | null) ?? []}
          categories={(categoriesResult.data as Category[] | null) ?? []}
          initial={{
            id: row.id,
            wallet_id: row.wallet_id,
            category_id: row.category_id,
            type: row.type,
            amount: Number(row.amount),
            note: row.note,
            occurred_at: row.occurred_at,
          }}
          footer={<DeleteTransactionButton id={row.id} />}
        />
      ) : (
        <p className="card text-sm text-muted">
          Khoản này do người khác trong nhà nhập, nên chỉ họ sửa hoặc xoá được.
        </p>
      )}
    </div>
  );
}
