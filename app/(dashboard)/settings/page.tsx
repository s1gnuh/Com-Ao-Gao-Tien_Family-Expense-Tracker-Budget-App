import BudgetForm, { type BudgetRow } from '@/components/settings/BudgetForm';
import ProfileForm from '@/components/settings/ProfileForm';
import { signOutAction } from './actions';
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

  const [profileResult, walletsResult, categoriesResult, budgetsResult, spendResult, aiResult] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.id ?? '').maybeSingle(),
      supabase.from('wallets').select('id,name,type').order('type').order('name'),
      supabase.from('categories').select('*').order('kind').order('name'),
      supabase.from('budgets').select('*').eq('period', 'monthly'),
      supabase
        .from('transactions')
        .select('wallet_id,category_id,amount')
        .eq('type', 'expense')
        .gte('occurred_at', from)
        .lte('occurred_at', to),
      supabase.rpc('ai_usage_today').maybeSingle(),
    ]);

  const profile = profileResult.data as Profile | null;
  const wallets = (walletsResult.data ?? []) as Pick<Wallet, 'id' | 'name' | 'type'>[];
  const categories = (categoriesResult.data ?? []) as Category[];
  const budgets = (budgetsResult.data ?? []) as Budget[];
  const spend = (spendResult.data ?? []) as {
    wallet_id: string;
    category_id: string | null;
    amount: number;
  }[];

  const spentByKey = new Map<string, number>();
  for (const row of spend) {
    if (!row.category_id) continue;
    const key = `${row.wallet_id}:${row.category_id}`;
    spentByKey.set(key, (spentByKey.get(key) ?? 0) + Number(row.amount));
  }

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

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Cài đặt</h1>

      <ProfileForm profile={profile} username={username} fallbackName={username} />

      <BudgetForm wallets={wallets} categories={categories} rows={rows} />

      {ai && <AiQuotaCard used={Number(ai.calls)} resetsAt={ai.resets_at} />}

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

      <form action={signOutAction}>
        <button
          type="submit"
          className="tap min-h-[48px] w-full rounded-xl border border-border bg-surface font-medium text-expense"
        >
          Đăng xuất
        </button>
      </form>

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
