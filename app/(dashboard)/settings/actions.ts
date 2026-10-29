'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildReminderPayload, sendPush, type WalletBalanceRow } from '@/lib/push';
import { todayInput } from '@/lib/formatters';

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

interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Called right after the browser grants permission and subscribes. Saves the
 * subscription and flips the preference on in one round trip instead of two
 * separate actions each paying their own getUser() network call — on a phone
 * network that was the difference between the toggle feeling instant and
 * feeling stuck for a couple of seconds.
 */
export async function enablePush(
  subscription: BrowserSubscription,
  remindHour: number,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Phiên đăng nhập đã hết.', ok: false };

  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { error: 'Đăng ký thông báo không hợp lệ.', ok: false };
  }
  if (!Number.isInteger(remindHour) || remindHour < 0 || remindHour > 23) {
    return { error: 'Giờ nhắc không hợp lệ.', ok: false };
  }

  const [subResult, prefResult] = await Promise.all([
    supabase.from('push_subscriptions').upsert(
      {
        user_id: auth.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: 'endpoint' },
    ),
    supabase
      .from('notification_preferences')
      .upsert({ user_id: auth.user.id, enabled: true, remind_hour: remindHour }, { onConflict: 'user_id' }),
  ]);

  if (subResult.error) return { error: 'Không lưu được đăng ký thông báo.', ok: false };
  if (prefResult.error) return { error: 'Không lưu được cài đặt nhắc nhở.', ok: false };

  revalidatePath('/settings');
  return { error: null, ok: true };
}

/**
 * Called when the toggle is switched off: drops the subscription (so the push
 * service stops being billed for it) and flips the preference in one round
 * trip, same reasoning as enablePush above.
 */
export async function disablePush(endpoint: string | null, remindHour: number): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Phiên đăng nhập đã hết.', ok: false };

  const [subResult, prefResult] = await Promise.all([
    endpoint
      ? supabase.from('push_subscriptions').delete().eq('user_id', auth.user.id).eq('endpoint', endpoint)
      : Promise.resolve({ error: null }),
    supabase
      .from('notification_preferences')
      .upsert({ user_id: auth.user.id, enabled: false, remind_hour: remindHour }, { onConflict: 'user_id' }),
  ]);

  if (subResult.error) return { error: 'Không xoá được đăng ký thông báo.', ok: false };
  if (prefResult.error) return { error: 'Không lưu được cài đặt nhắc nhở.', ok: false };

  revalidatePath('/settings');
  return { error: null, ok: true };
}

export async function updateNotificationPrefs(
  enabled: boolean,
  remindHour: number,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Phiên đăng nhập đã hết.', ok: false };

  if (!Number.isInteger(remindHour) || remindHour < 0 || remindHour > 23) {
    return { error: 'Giờ nhắc không hợp lệ.', ok: false };
  }

  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: auth.user.id, enabled, remind_hour: remindHour }, { onConflict: 'user_id' });

  if (error) return { error: 'Không lưu được cài đặt nhắc nhở.', ok: false };

  revalidatePath('/settings');
  return { error: null, ok: true };
}

/**
 * Sends one real push to every device this person has registered, built from
 * their own current balances — an honest preview of the daily reminder, not a
 * placeholder, which is also the easiest way to prove the whole chain works
 * end to end on their actual phone.
 */
export async function sendTestNotification(): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Phiên đăng nhập đã hết.', ok: false };

  const [subsResult, walletsResult, todayResult] = await Promise.all([
    supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', auth.user.id),
    // RLS already limits this to the caller's own wallet plus the shared one.
    supabase.from('wallet_balances').select('name,type,balance').eq('is_archived', false),
    supabase
      .from('transactions')
      .select('id')
      .eq('created_by', auth.user.id)
      .eq('occurred_at', todayInput())
      .limit(1),
  ]);

  const subs = subsResult.data ?? [];
  if (subs.length === 0) {
    return { error: 'Chưa bật nhận thông báo trên thiết bị này.', ok: false };
  }

  const wallets = (walletsResult.data ?? []) as WalletBalanceRow[];
  const payload = buildReminderPayload(wallets, (todayResult.data?.length ?? 0) > 0);
  payload.title = `🔔 Thử: ${payload.title}`;

  const results = await Promise.all(subs.map((sub) => sendPush(sub, payload)));

  const gone = subs.filter((_, index) => results[index] === 'gone').map((sub) => sub.id);
  if (gone.length > 0) await supabase.from('push_subscriptions').delete().in('id', gone);

  if (results.every((outcome) => outcome !== 'sent')) {
    return {
      error:
        gone.length > 0
          ? 'Thiết bị đã huỷ nhận thông báo, hãy bật lại.'
          : 'Gửi thông báo thất bại, thử lại sau.',
      ok: false,
    };
  }

  return { error: null, ok: true };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
