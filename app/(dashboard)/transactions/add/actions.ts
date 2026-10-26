'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import type { TransactionSource, TransactionType } from '@/types';

export interface CreateTransactionState {
  error: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createTransaction(
  _previous: CreateTransactionState,
  formData: FormData,
): Promise<CreateTransactionState> {
  const supabase = await createClient();
  // getUser() would add a 300-400ms round trip before every save. The id below
  // is not trusted: the insert policy requires created_by = auth.uid(), which
  // Postgres derives from the token it validates itself, so a wrong or forged
  // value is rejected by the database rather than accepted here.
  const session = await readSessionFast();
  if (!session.id) return { error: 'Phiên đăng nhập đã hết, vui lòng vào lại.' };

  const walletId = String(formData.get('wallet_id') ?? '');
  if (!UUID.test(walletId)) return { error: 'Chưa chọn ví.' };

  const amount = Number(formData.get('amount'));
  if (!Number.isInteger(amount) || amount <= 0) return { error: 'Số tiền không hợp lệ.' };
  if (amount > 10_000_000_000) return { error: 'Số tiền quá lớn.' };

  const type = String(formData.get('type') ?? '') as TransactionType;
  if (type !== 'income' && type !== 'expense') return { error: 'Loại giao dịch không hợp lệ.' };

  const source = String(formData.get('source') ?? 'manual') as TransactionSource;

  const occurredAt = String(formData.get('occurred_at') ?? '');
  if (!DATE.test(occurredAt)) return { error: 'Ngày không hợp lệ.' };

  const categoryRaw = String(formData.get('category_id') ?? '');
  const categoryId = UUID.test(categoryRaw) ? categoryRaw : null;

  const noteRaw = String(formData.get('note') ?? '').trim();
  const note = noteRaw.length > 0 ? noteRaw.slice(0, 140) : null;

  const hashRaw = String(formData.get('receipt_hash') ?? '');
  const receiptHash = /^[0-9a-f]{64}$/.test(hashRaw) ? hashRaw : null;

  // RLS re-checks wallet access and that created_by matches the caller.
  const { error } = await supabase.from('transactions').insert({
    wallet_id: walletId,
    created_by: session.id,
    category_id: categoryId,
    type,
    amount,
    note,
    occurred_at: occurredAt,
    source: source === 'ai_receipt' ? 'ai_receipt' : 'manual',
    receipt_hash: receiptHash,
  });

  if (error) return { error: 'Không lưu được giao dịch, thử lại nhé.' };

  revalidatePath('/transactions');
  revalidatePath('/');
  redirect('/transactions');
}
