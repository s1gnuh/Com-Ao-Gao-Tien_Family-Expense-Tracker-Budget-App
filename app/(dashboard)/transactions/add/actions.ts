'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import { MAX_RECEIPT_BATCH, type ReceiptRow } from '@/lib/receipts';
import type { TransactionSource, TransactionType } from '@/types';

export interface CreateTransactionState {
  error: string | null;
  /** Set when "Lưu & nhập tiếp" saved a row and the form should reset in place. */
  saved?: { at: number; amount: number; type: TransactionType };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_AMOUNT = 10_000_000_000;

/**
 * A receipt photo may only be filed under the uploader's own folder, which is
 * also the only place storage policy lets them write. Anything else is dropped
 * rather than pointing a row at somebody else's picture.
 */
function receiptPath(raw: unknown, userId: string): string | null {
  const value = String(raw ?? '');
  const prefix = `${userId}/`;
  if (!UUID.test(userId) || !value.startsWith(prefix)) return null;
  return /^[0-9a-f]{64}\.jpg$/.test(value.slice(prefix.length)) ? value : null;
}

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
  if (amount > MAX_AMOUNT) return { error: 'Số tiền quá lớn.' };

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
  const receiptHash = HASH.test(hashRaw) ? hashRaw : null;
  const again = formData.get('intent') === 'again';

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
    receipt_url: receiptPath(formData.get('receipt_url'), session.id),
  });

  // 23514 is the check violation enforce_income_is_personal() raises; it is the
  // one failure here a person can actually act on.
  if (error) {
    return {
      error:
        error.code === '23514'
          ? 'Khoản thu chỉ ghi vào ví cá nhân được.'
          : 'Không lưu được giao dịch, thử lại nhé.',
    };
  }

  revalidatePath('/transactions');
  revalidatePath('/wallets');
  revalidatePath('/');

  // Entering a whole evening's receipts one after another should not mean a
  // trip to the list and back for each of them.
  if (again) return { error: null, saved: { at: Date.now(), amount, type } };
  redirect('/transactions');
}

/**
 * Writes a whole reviewed batch in one insert. The rows arrive already checked
 * by the deck, but they came from the browser, so every field is validated here
 * again before it reaches the table.
 */
export async function createTransactionsBatch(
  rows: ReceiptRow[],
): Promise<CreateTransactionState> {
  const supabase = await createClient();
  const session = await readSessionFast();
  if (!session.id) return { error: 'Phiên đăng nhập đã hết, vui lòng vào lại.' };

  if (!Array.isArray(rows) || rows.length === 0) return { error: 'Chưa có khoản nào để lưu.' };
  if (rows.length > MAX_RECEIPT_BATCH) {
    return { error: `Mỗi lượt chỉ lưu được ${MAX_RECEIPT_BATCH} khoản.` };
  }

  const payload = [];
  for (const row of rows) {
    if (!UUID.test(String(row.wallet_id))) return { error: 'Có khoản chưa chọn ví.' };

    const amount = Number(row.amount);
    if (!Number.isInteger(amount) || amount <= 0) return { error: 'Có khoản ghi số tiền sai.' };
    if (amount > MAX_AMOUNT) return { error: 'Có khoản ghi số tiền quá lớn.' };

    if (row.type !== 'income' && row.type !== 'expense') {
      return { error: 'Có khoản sai loại thu/chi.' };
    }

    const occurredAt = String(row.occurred_at ?? '');
    if (!DATE.test(occurredAt)) return { error: 'Có khoản ghi ngày sai.' };

    const noteRaw = typeof row.note === 'string' ? row.note.trim() : '';

    payload.push({
      wallet_id: row.wallet_id,
      created_by: session.id,
      category_id: UUID.test(String(row.category_id)) ? row.category_id : null,
      type: row.type,
      amount,
      note: noteRaw.length > 0 ? noteRaw.slice(0, 140) : null,
      occurred_at: occurredAt,
      source: 'ai_receipt' as const,
      receipt_hash: HASH.test(String(row.receipt_hash)) ? row.receipt_hash : null,
      receipt_url: receiptPath(row.receipt_url, session.id),
    });
  }

  const { error } = await supabase.from('transactions').insert(payload);
  if (error) {
    return {
      error:
        error.code === '23514'
          ? 'Có khoản thu đang ghi vào quỹ gia đình — sửa lại thành ví cá nhân nhé.'
          : 'Không lưu được, thử lại nhé.',
    };
  }

  revalidatePath('/transactions');
  revalidatePath('/wallets');
  revalidatePath('/');
  redirect('/transactions');
}
