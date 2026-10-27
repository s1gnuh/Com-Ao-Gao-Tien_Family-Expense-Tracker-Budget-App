import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { formatVND, HOUSEHOLD_TZ } from '@/lib/formatters';

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WalletBalanceRow {
  name: string;
  type: 'personal' | 'shared';
  balance: number;
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

const WALLET_EMOJI: Record<WalletBalanceRow['type'], string> = {
  shared: '👨‍👩‍👧‍👦',
  personal: '👤',
};

/**
 * Shared by the real daily reminder and the "gửi thử" button, so the test
 * notification is an honest preview rather than a generic placeholder.
 */
export function buildReminderPayload(
  wallets: WalletBalanceRow[],
  hasEntryToday: boolean,
): { title: string; body: string; url: string; tag: string } {
  const lines = wallets
    .slice()
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'shared' ? -1 : 1))
    .map((wallet) => `${WALLET_EMOJI[wallet.type]} ${wallet.name}: ${formatVND(wallet.balance)}`);

  return {
    title: hasEntryToday ? '✅ Tổng kết cuối ngày' : '⏰ Đừng quên ghi sổ hôm nay!',
    body: [...lines, hasEntryToday ? 'Chạm để xem lại.' : 'Chạm để ghi khoản hôm nay.'].join('\n'),
    url: hasEntryToday ? '/' : '/transactions/add',
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
