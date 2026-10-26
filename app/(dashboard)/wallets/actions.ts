'use server';

import { revalidatePath } from 'next/cache';
import { createClient, readSessionFast } from '@/lib/supabase/server';

export interface WalletState {
  error: string | null;
  ok: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath('/wallets');
  revalidatePath('/');
  revalidatePath('/transactions');
}

function readName(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0) return { ok: false as const, error: 'Chưa đặt tên ví.' };
  if (name.length > 40) return { ok: false as const, error: 'Tên ví tối đa 40 ký tự.' };
  return { ok: true as const, name };
}

export async function createWallet(
  _previous: WalletState,
  formData: FormData,
): Promise<WalletState> {
  const parsed = readName(formData);
  if (!parsed.ok) return { error: parsed.error, ok: false };

  const session = await readSessionFast();
  if (!session.id) return { error: 'Phiên đăng nhập đã hết.', ok: false };

  const supabase = await createClient();
  // Only personal wallets are creatable: the shared fund is a single row the
  // schema already guarantees, and RLS refuses a second one.
  const { error } = await supabase
    .from('wallets')
    .insert({ name: parsed.name, type: 'personal', owner_id: session.id });

  if (error) return { error: 'Không tạo được ví mới.', ok: false };

  refresh();
  return { error: null, ok: true };
}

export async function renameWallet(
  _previous: WalletState,
  formData: FormData,
): Promise<WalletState> {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Ví không hợp lệ.', ok: false };

  const parsed = readName(formData);
  if (!parsed.ok) return { error: parsed.error, ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('wallets')
    .update({ name: parsed.name })
    .eq('id', id)
    .select('id');

  if (error) return { error: 'Không đổi được tên ví.', ok: false };
  if (!data?.length) return { error: 'Ví này bạn không sửa được.', ok: false };

  refresh();
  return { error: null, ok: true };
}

/**
 * Hides a wallet instead of deleting it. Transactions cascade from wallets, so
 * a delete would take the household's history with it; an empty personal wallet
 * is removed outright because there is nothing to lose.
 */
export async function archiveWallet(
  _previous: WalletState,
  formData: FormData,
): Promise<WalletState> {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Ví không hợp lệ.', ok: false };

  const supabase = await createClient();

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_id', id);

  if ((count ?? 0) === 0) {
    const { data, error } = await supabase.from('wallets').delete().eq('id', id).select('id');
    if (!error && data?.length) {
      refresh();
      return { error: null, ok: true };
    }
    // Falls through to archiving when the delete is refused, e.g. the shared fund.
  }

  const { data, error } = await supabase
    .from('wallets')
    .update({ is_archived: true })
    .eq('id', id)
    .select('id');

  if (error) return { error: 'Không ẩn được ví.', ok: false };
  if (!data?.length) return { error: 'Ví này bạn không sửa được.', ok: false };

  refresh();
  return { error: null, ok: true };
}

export async function restoreWallet(
  _previous: WalletState,
  formData: FormData,
): Promise<WalletState> {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Ví không hợp lệ.', ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('wallets')
    .update({ is_archived: false })
    .eq('id', id)
    .select('id');

  if (error || !data?.length) return { error: 'Không khôi phục được ví.', ok: false };

  refresh();
  return { error: null, ok: true };
}
