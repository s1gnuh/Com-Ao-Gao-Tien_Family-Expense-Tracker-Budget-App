import BudgetForm, { type BudgetRow } from '@/components/settings/BudgetForm';
import ProfileForm from '@/components/settings/ProfileForm';
import PasskeySettings, { type PasskeyRow } from '@/components/settings/PasskeySettings';
import PushSettings from '@/components/settings/PushSettings';
import SignOutButton from '@/components/settings/SignOutButton';
import { createClient, readSessionFast } from '@/lib/supabase/server';
import { monthRange } from '@/lib/formatters';
import type { Budget, Category, Profile, Wallet } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cài đặt' };

export default async function SettingsPage() {
  const supabase = await createClient();
  // Reading identity from the cookie keeps all five queries in one round trip;
  // getUser() would serialise a 300-400ms call ahead of them. Nothing here is
  // gated on it — RLS decides what each query may return.
  const session = await readSessionFast();
  const { from, to } = monthRange();

  const [
    profileResult,
    walletsResult,
    categoriesResult,
    budgetsResult,
    spendResult,
    aiResult,
    notifResult,
    passkeysResult,
  ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.id ?? '').maybeSingle(),
      supabase.from('wallets').select('id,name,type').order('type').order('name'),
      supabase.from('categories').select('*').order('kind').order('name'),
      supabase.from('budgets').select('*').eq('period', 'monthly'),
      // Summed in Postgres: one row per wallet and category instead of every
      // expense of the month shipped here to be added up.
      supabase.rpc('category_breakdown', { p_from: from, p_to: to }),
      supabase.rpc('ai_usage_today').maybeSingle(),
      supabase
        .from('notification_preferences')
        .select('enabled,remind_hour')
        .eq('user_id', session.id ?? '')
        .maybeSingle(),
      supabase
        .from('passkeys')
        .select('id,device_name,created_at,last_used_at')
        .order('created_at', { ascending: false }),
    ]);

  const profile = profileResult.data as Profile | null;
  const wallets = (walletsResult.data ?? []) as Pick<Wallet, 'id' | 'name' | 'type'>[];
  const categories = (categoriesResult.data ?? []) as Category[];
  const budgets = (budgetsResult.data ?? []) as Budget[];
  const spend = (spendResult.data ?? []) as {
    wallet_id: string;
    category_id: string;
    spent: number;
  }[];

  const spentByKey = new Map(
    spend.map((row) => [`${row.wallet_id}:${row.category_id}`, Number(row.spent)]),
  );

  const rows: Record<string, BudgetRow> = {};
  for (const wallet of wallets) {
    for (const category of categories) {
      const key = `${wallet.id}:${category.id}`;
      const budget = budgets.find(
        (item) => item.wallet_id === wallet.id && item.category_id === category.id,
      );
      rows[key] = {
        categoryId: category.id,
        limit: budget ? Number(budget.limit_amount) : 0,
        spent: spentByKey.get(key) ?? 0,
      };
    }
  }

  // Accounts are keyed by a synthetic address, so the username is its local part.
  const username = session.email.split('@')[0] ?? '';

  // Absent until the project has run the latest schema.sql, in which case the
  // card simply does not appear rather than the whole page failing.
  const ai = aiResult.data as { calls: number; resets_at: string } | null;
  const notif = notifResult.data as { enabled: boolean; remind_hour: number } | null;

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Cài đặt</h1>

      <ProfileForm profile={profile} username={username} fallbackName={username} />

      <BudgetForm wallets={wallets} categories={categories} rows={rows} />

      {ai && <AiQuotaCard used={Number(ai.calls)} resetsAt={ai.resets_at} />}

      {/* Absent until the latest schema.sql has run: no table, no card. */}
      {!passkeysResult.error && (
        <PasskeySettings passkeys={(passkeysResult.data ?? []) as PasskeyRow[]} />
      )}

      {!notifResult.error && (
        <PushSettings
          initialEnabled={notif?.enabled ?? false}
          initialHour={notif?.remind_hour ?? 20}
        />
      )}

      <a
        href="/huong-dan.html"
        className="card tap flex w-full items-center gap-3 text-left"
      >
        <span aria-hidden className="text-2xl">
          📖
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Hướng dẫn sử dụng</span>
          <span className="mt-0.5 block text-xs text-muted">
            Từng màn hình một, ngắn gọn cho cả nhà
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          ›
        </span>
      </a>

      <SignOutButton />

      <p className="pb-2 text-center text-xs text-muted">Cơm Áo Gạo Tiền</p>
    </div>
  );
}

/**
 * Google publishes no "requests left" figure anywhere in the API response — a
 * 429 is the only notice you get — so this counts the household's own calls and
 * measures them against the ceiling the project's dashboard reports. That
 * ceiling has changed more than once, hence an env var and not a constant.
 */
const DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 500);

// Vercel runs in UTC, so the zone has to be named or the reset reads hours off.
const resetTime = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

function AiQuotaCard({ used, resetsAt }: { used: number; resetsAt: string }) {
  const limit = Number.isFinite(DAILY_LIMIT) && DAILY_LIMIT > 0 ? DAILY_LIMIT : 500;
  const left = Math.max(0, limit - used);
  const ratio = Math.min(1, used / limit);
  const low = left <= limit / 10;

  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">Lượt AI đọc hoá đơn</span>
        <span className="tabular shrink-0 text-sm text-muted">
          {used}/{limit}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label="Lượt AI đã dùng hôm nay"
        className="h-2 overflow-hidden rounded-full bg-bg"
      >
        <div
          className={`h-full rounded-full ${low ? 'bg-expense' : 'bg-brand'}`}
          style={{ width: `${used > 0 ? Math.max(ratio * 100, 4) : 0}%` }}
        />
      </div>

      <p className="text-xs text-muted">
        Còn <span className="font-medium text-fg">{left} lượt</span> hôm nay, đặt lại lúc{' '}
        {resetTime.format(new Date(resetsAt))} giờ Việt Nam. Cả nhà dùng chung một hạn mức.
      </p>
      <p className="text-xs text-muted">
        App tự đếm mỗi ảnh gửi đi. Hạn mức thật do Google đặt — đối chiếu trong Google AI Studio
        nếu thấy lệch.
      </p>
    </div>
  );
}
