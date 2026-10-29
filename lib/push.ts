import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describeBill, sortBills, REMINDER_BILL_DAYS } from '@/lib/bills';
import {
  formatVND,
  householdParts,
  monthRange,
  todayInput,
  HOUSEHOLD_TZ,
} from '@/lib/formatters';
import type { RecurringBill } from '@/types';

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Everything one person's reminder says, gathered before any of it is worded. */
export interface ReminderFacts {
  /** The family fund alone — the one figure this household set out to watch. */
  fundExpense: number;
  /** The household's month number, not the server's. */
  month: number;
  personal: { name: string; balance: number }[];
  bills: { name: string; amount: number; daysLeft: number }[];
  hasEntryToday: boolean;
}

interface WalletRow {
  wallet_id: string;
  name: string;
  type: 'personal' | 'shared';
  balance: number;
}

/**
 * Reads one person's standing from whichever client is to hand. Every filter is
 * spelled out rather than left to RLS, because the nightly cron runs on the
 * service key, which has no session for a policy to scope by — and spelling
 * them out costs the signed-in caller nothing, since RLS would only narrow to
 * the same rows anyway.
 */
export async function collectReminderFacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReminderFacts> {
  const { from, to } = monthRange();
  const today = todayInput();

  const [walletsResult, monthResult, todayResult, billsResult] = await Promise.all([
    supabase
      .from('wallet_balances')
      .select('wallet_id,name,type,balance')
      .eq('is_archived', false)
      .or(`owner_id.eq.${userId},type.eq.shared`),
    supabase.rpc('wallet_month_totals', { p_from: from, p_to: to }),
    supabase
      .from('transactions')
      .select('id')
      .eq('created_by', userId)
      .eq('occurred_at', today)
      .limit(1),
    supabase.from('recurring_bills').select('*').eq('is_active', true),
  ]);

  const wallets = (walletsResult.data ?? []) as WalletRow[];
  const reach = new Set(wallets.map((wallet) => wallet.wallet_id));
  const fund = new Set(
    wallets.filter((wallet) => wallet.type === 'shared').map((wallet) => wallet.wallet_id),
  );

  const fundExpense = ((monthResult.data ?? []) as { wallet_id: string; expense: number }[])
    .filter((row) => fund.has(row.wallet_id))
    .reduce((sum, row) => sum + Number(row.expense), 0);

  const bills = sortBills(
    ((billsResult.data ?? []) as RecurringBill[])
      .filter((bill) => reach.has(bill.wallet_id))
      .map((bill) => describeBill(bill)),
  )
    .filter((entry) => entry.status !== 'paid' && entry.daysLeft <= REMINDER_BILL_DAYS)
    .map((entry) => ({
      name: entry.bill.name,
      amount: Number(entry.bill.amount),
      daysLeft: entry.daysLeft,
    }));

  return {
    fundExpense,
    month: householdParts().month,
    personal: wallets
      .filter((wallet) => wallet.type === 'personal')
      .map((wallet) => ({ name: wallet.name, balance: Number(wallet.balance) })),
    bills,
    hasEntryToday: (todayResult.data?.length ?? 0) > 0,
  };
}

let configured = false;

/** VAPID keys sign every push so the service can tell it really came from us. */
function ensureConfigured() {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error('Thiếu VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_SUBJECT.');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/** The hour it is right now, on the household's own clock — never the server's. */
export function householdHourNow(at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: HOUSEHOLD_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(at);
  // "24" at local midnight under hour12:false in some ICU builds; fold it to 0.
  return Number(hour) % 24;
}

/** Only ever a couple: iOS clips a long notification, and the point is the nudge. */
const BILLS_SHOWN = 2;

function billLine({ name, amount, daysLeft }: ReminderFacts['bills'][number]): string {
  const when =
    daysLeft < 0
      ? `quá hạn ${Math.abs(daysLeft)} ngày`
      : daysLeft === 0
        ? 'đến hạn hôm nay'
        : `còn ${daysLeft} ngày`;
  return `📌 ${name} ${formatVND(amount)} — ${when}`;
}

/**
 * Shared by the real daily reminder and the "gửi thử" button, so the test
 * notification is an honest preview rather than a generic placeholder.
 */
export function buildReminderPayload(
  facts: ReminderFacts,
): { title: string; body: string; url: string; tag: string } {
  const lines = [
    `👨‍👩‍👧‍👦 Ví gia đình tháng ${facts.month} tổng đã chi: ${formatVND(facts.fundExpense)}`,
  ];

  for (const wallet of facts.personal) {
    lines.push(`👤 ${wallet.name}: ${formatVND(wallet.balance)}`);
  }

  for (const bill of facts.bills.slice(0, BILLS_SHOWN)) lines.push(billLine(bill));
  if (facts.bills.length > BILLS_SHOWN) {
    lines.push(`…và ${facts.bills.length - BILLS_SHOWN} hoá đơn nữa sắp tới hạn.`);
  }

  lines.push(
    facts.hasEntryToday ? 'Chạm để xem lại sổ hôm nay.' : 'Nhớ ghi lại các khoản hôm nay nhé!',
  );

  return {
    title: facts.hasEntryToday ? '✅ Tổng kết cuối ngày' : '⏰ Đừng quên ghi sổ hôm nay!',
    body: lines.join('\n'),
    url: facts.hasEntryToday ? '/' : '/transactions/add',
    tag: 'daily-reminder',
  };
}

export type PushOutcome = 'sent' | 'gone' | 'failed';

/**
 * Sends to one endpoint and reports whether that subscription is still good.
 * `gone` means the push service itself says the endpoint no longer exists
 * (410) or was never valid (404) — the only cases worth deleting our row for.
 * Anything else (network hiccup, 5xx from the push service) is `failed` and
 * left alone, since the subscription itself may still be fine tomorrow.
 */
export async function sendPush(
  subscription: StoredSubscription,
  payload: { title: string; body: string; url: string; tag: string },
): Promise<PushOutcome> {
  const target: WebPushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };

  try {
    // Inside the try: a deploy that hasn't set the VAPID env vars yet should
    // report every send as a clean "failed", not throw out of the batch this
    // call is usually run in.
    ensureConfigured();
    await webpush.sendNotification(target, JSON.stringify(payload), {
      // Reminders are only worth delivering the same day they're sent; no
      // point the push service holding one for later.
      TTL: 60 * 60 * 12,
    });
    return 'sent';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? 'gone' : 'failed';
  }
}
