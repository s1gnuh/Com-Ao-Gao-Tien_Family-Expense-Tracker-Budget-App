'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface ActionState {
  error: string | null;
  ok: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Phiên đăng nhập đã hết.', ok: false };

  const displayName = String(formData.get('display_name') ?? '').trim();
  if (displayName.length === 0) return { error: 'Tên hiển thị không được để trống.', ok: false };
  if (displayName.length > 40) return { error: 'Tên hiển thị tối đa 40 ký tự.', ok: false };

  const emoji = String(formData.get('avatar_emoji') ?? '').trim().slice(0, 8) || null;

  const optional = (key: string, max: number) => {
    const value = String(formData.get(key) ?? '').trim().slice(0, max);
    return value.length > 0 ? value : null;
  };

  const birthdayRaw = String(formData.get('birthday') ?? '').trim();
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw) ? birthdayRaw : null;

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      avatar_emoji: emoji,
      full_name: optional('full_name', 80),
      family_role: optional('family_role', 20),
      phone: optional('phone', 20),
      birthday,
      note: optional('note', 200),
    })
    .eq('id', auth.user.id);

  if (error) return { error: 'Không lưu được hồ sơ.', ok: false };

  revalidatePath('/settings');
  revalidatePath('/');
  return { error: null, ok: true };
}

export async function saveBudgets(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Phiên đăng nhập đã hết.', ok: false };

  const walletId = String(formData.get('wallet_id') ?? '');
  if (!UUID.test(walletId)) return { error: 'Chưa chọn ví.', ok: false };

  const upserts: { wallet_id: string; category_id: string; limit_amount: number; period: 'monthly' }[] = [];
  const clears: string[] = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith('limit_')) continue;
    const categoryId = key.slice('limit_'.length);
    if (!UUID.test(categoryId)) continue;

    const digits = String(raw).replace(/[^\d]/g, '');
    const amount = digits ? Number(digits) : 0;

    if (amount > 0) {
      upserts.push({ wallet_id: walletId, category_id: categoryId, limit_amount: amount, period: 'monthly' });
    } else {
      clears.push(categoryId);
    }
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('budgets')
      .upsert(upserts, { onConflict: 'wallet_id,category_id,period' });
    if (error) return { error: 'Không lưu được hạn mức.', ok: false };
  }

  if (clears.length > 0) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('wallet_id', walletId)
      .eq('period', 'monthly')
      .in('category_id', clears);
    if (error) return { error: 'Không xoá được hạn mức cũ.', ok: false };
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { error: null, ok: true };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
