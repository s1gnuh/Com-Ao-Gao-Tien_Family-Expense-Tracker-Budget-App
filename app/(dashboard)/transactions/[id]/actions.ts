'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { TransactionType } from '@/types';

export interface EditTransactionState {
  error: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refreshViews() {
  revalidatePath('/transactions');
  revalidatePath('/wallets');
  revalidatePath('/');
}

export async function updateTransaction(
  _previous: EditTransactionState,
  formData: FormData,
): Promise<EditTransactionState> {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Giao dịch không hợp lệ.' };

  const walletId = String(formData.get('wallet_id') ?? '');
  if (!UUID.test(walletId)) return { error: 'Chưa chọn ví.' };

  const amount = Number(formData.get('amount'));
  if (!Number.isInteger(amount) || amount <= 0) return { error: 'Số tiền không hợp lệ.' };
  if (amount > 10_000_000_000) return { error: 'Số tiền quá lớn.' };

  const type = String(formData.get('type') ?? '') as TransactionType;
  if (type !== 'income' && type !== 'expense') return { error: 'Loại giao dịch không hợp lệ.' };

  const occurredAt = String(formData.get('occurred_at') ?? '');
  if (!DATE.test(occurredAt)) return { error: 'Ngày không hợp lệ.' };

  const categoryRaw = String(formData.get('category_id') ?? '');
  const noteRaw = String(formData.get('note') ?? '').trim();

  const supabase = await createClient();
  // No ownership check here: transactions_update_own scopes the statement to
  // rows the caller wrote, so someone else's row simply matches nothing.
  const { data, error } = await supabase
    .from('transactions')
    .update({
      wallet_id: walletId,
      category_id: UUID.test(categoryRaw) ? categoryRaw : null,
      type,
      amount,
      note: noteRaw.length > 0 ? noteRaw.slice(0, 140) : null,
      occurred_at: occurredAt,
    })
    .eq('id', id)
    .select('id');

  if (error) return { error: 'Không lưu được thay đổi, thử lại nhé.' };
  if (!data || data.length === 0) {
    return { error: 'Chỉ người tạo giao dịch mới sửa được khoản này.' };
  }

  refreshViews();
  redirect('/transactions');
}

export async function deleteTransaction(
  _previous: EditTransactionState,
  formData: FormData,
): Promise<EditTransactionState> {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Giao dịch không hợp lệ.' };

  const supabase = await createClient();
  const { data, error } = await supabase.from('transactions').delete().eq('id', id).select('id');

  if (error) return { error: 'Không xoá được giao dịch, thử lại nhé.' };
  if (!data || data.length === 0) {
    return { error: 'Chỉ người tạo giao dịch mới xoá được khoản này.' };
  }

  refreshViews();
  redirect('/transactions');
}
