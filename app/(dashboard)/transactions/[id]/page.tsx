import Link from 'next/link';
import { notFound } from 'next/navigation';
import DeleteTransactionButton from '@/components/transactions/DeleteTransactionButton';
import QuickInputForm, { type EditableTransaction } from '@/components/transactions/QuickInputForm';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import { RECEIPT_BUCKET } from '@/lib/receipts';
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
      .select(
        'id,wallet_id,category_id,type,amount,note,occurred_at,created_by,receipt_url,' +
          'author:profiles(display_name)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('wallets').select('*').order('type', { ascending: true }).order('name'),
    supabase.from('categories').select('*').order('kind').order('name'),
  ]);

  const row = transactionResult.data as
    | (EditableTransaction & {
        created_by: string;
        receipt_url: string | null;
        author: { display_name: string } | null;
      })
    | null;
  if (!row) notFound();

  // Anyone who can see the wallet can fix what is in it, so the only thing
  // worth saying about authorship is whose entry is being changed.
  const theirs = row.created_by !== session.id ? row.author?.display_name : null;

  // A short-lived link: the bucket is private, and storage policy only signs it
  // for someone who can already see this row.
  const receipt = row.receipt_url
    ? (await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(row.receipt_url, 60 * 10)).data
        ?.signedUrl ?? null
    : null;

  return (
    <div className="space-y-5 py-4">
      <header className="flex items-center gap-3">
        <Link href="/transactions" aria-label="Quay lại" className="tap text-xl text-muted">
          ←
        </Link>
        <h1 className="text-2xl font-semibold">Sửa giao dịch</h1>
      </header>

      {theirs && (
        <p className="card text-sm text-muted">
          Khoản này do <span className="font-medium text-fg">{theirs}</span> nhập. Cả nhà đều sửa
          hoặc xoá được, nên soát kỹ trước khi đổi nhé.
        </p>
      )}

      {receipt && (
        <a
          href={receipt}
          target="_blank"
          rel="noreferrer"
          className="card tap flex items-center gap-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring URL */}
          <img
            src={receipt}
            alt="Ảnh hoá đơn của khoản này"
            className="h-16 w-16 shrink-0 rounded-xl bg-bg object-cover object-top"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Ảnh hoá đơn gốc</span>
            <span className="block text-xs text-muted">Chạm để xem cỡ lớn</span>
          </span>
          <span aria-hidden className="shrink-0 text-muted">
            ›
          </span>
        </a>
      )}

      <QuickInputForm
        wallets={(walletsResult.data as Wallet[] | null) ?? []}
        categories={(categoriesResult.data as Category[] | null) ?? []}
        currentUserId={session.id}
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
    </div>
  );
}
