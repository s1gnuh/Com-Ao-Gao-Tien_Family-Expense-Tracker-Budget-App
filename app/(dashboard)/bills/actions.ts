'use server';

import { revalidatePath } from 'next/cache';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import { todayInput } from '@/lib/formatters';
import type { BillCycle } from '@/types';

export interface BillState {
  error: string | null;
  ok: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CYCLES: BillCycle[] = ['monthly', 'quarterly', 'yearly'];

function refresh() {
  revalidatePath('/bills');
  revalidatePath('/wallets');
  revalidatePath('/');
}

function readForm(formData: FormData) {
  const walletId = String(formData.get('wallet_id') ?? '');
  if (!UUID.test(walletId)) return { ok: false as const, error: 'Chưa chọn ví.' };

  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0) return { ok: false as const, error: 'Chưa đặt tên hoá đơn.' };
  if (name.length > 60) return { ok: false as const, error: 'Tên hoá đơn tối đa 60 ký tự.' };

  const amount = Number(String(formData.get('amount') ?? '').replace(/[^\d]/g, ''));
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false as const, error: 'Số tiền không hợp lệ.' };

  const cycle = String(formData.get('cycle') ?? '') as BillCycle;
  if (!CYCLES.includes(cycle)) return { ok: false as const, error: 'Chu kỳ không hợp lệ.' };

  const dueDay = Number(formData.get('due_day'));
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return { ok: false as const, error: 'Ngày đến hạn phải từ 1 đến 31.' };
  }

  const dueMonthRaw = Number(formData.get('due_month'));
  const dueMonth =
    cycle === 'monthly'
      ? null
      : Number.isInteger(dueMonthRaw) && dueMonthRaw >= 1 && dueMonthRaw <= 12
        ? dueMonthRaw
        : null;
  if (cycle !== 'monthly' && dueMonth === null) {
    return { ok: false as const, error: 'Chọn tháng đến hạn cho chu kỳ này.' };
  }

  const categoryRaw = String(formData.get('category_id') ?? '');
  const assigneeRaw = String(formData.get('assignee_id') ?? '');

  return {
    ok: true as const,
    values: {
      wallet_id: walletId,
      name,
      amount,
      cycle,
      due_day: dueDay,
      due_month: dueMonth,
      category_id: UUID.test(categoryRaw) ? categoryRaw : null,
      assignee_id: UUID.test(assigneeRaw) ? assigneeRaw : null,
    },
  };
}

export async function saveBill(_previous: BillState, formData: FormData): Promise<BillState> {
  const parsed = readForm(formData);
  if (!parsed.ok) return { error: parsed.error, ok: false };

  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');

  if (UUID.test(id)) {
    const { data, error } = await supabase
      .from('recurring_bills')
      .update(parsed.values)
      .eq('id', id)
      .select('id');
    if (error) return { error: 'Không lưu được hoá đơn.', ok: false };
    if (!data?.length) return { error: 'Hoá đơn này không còn nữa.', ok: false };
  } else {
    const session = await readSessionFast();
    if (!session.id) return { error: 'Phiên đăng nhập đã hết.', ok: false };

    // created_by is checked against auth.uid() by RLS, so a wrong value here is
    // refused by the database rather than trusted.
    const { error } = await supabase
      .from('recurring_bills')
      .insert({ ...parsed.values, created_by: session.id });
    if (error) return { error: 'Không thêm được hoá đơn.', ok: false };
  }

  refresh();
  return { error: null, ok: true };
}

export async function deleteBill(_previous: BillState, formData: FormData): Promise<BillState> {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Hoá đơn không hợp lệ.', ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recurring_bills')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { error: 'Không xoá được hoá đơn.', ok: false };
  if (!data?.length) return { error: 'Hoá đơn này không còn nữa.', ok: false };

  refresh();
  return { error: null, ok: true };
}

/** Marks the current cycle settled without creating a transaction. */
export async function markBillPaid(_previous: BillState, formData: FormData): Promise<BillState> {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Hoá đơn không hợp lệ.', ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recurring_bills')
    .update({ last_paid_on: todayInput() })
    .eq('id', id)
    .select('id');

  if (error || !data?.length) return { error: 'Không cập nhật được, thử lại nhé.', ok: false };

  refresh();
  return { error: null, ok: true };
}
