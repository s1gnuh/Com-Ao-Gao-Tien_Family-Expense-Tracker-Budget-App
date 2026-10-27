const vndFull = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const vndPlain = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function formatVND(amount: number): string {
  return vndFull.format(amount);
}

export function formatNumber(amount: number): string {
  return vndPlain.format(amount);
}

/** Signed display for a ledger row: income reads +, expense reads −. */
export function formatSigned(amount: number, type: 'income' | 'expense'): string {
  const sign = type === 'income' ? '+' : '−';
  return `${sign}${vndPlain.format(Math.abs(amount))}₫`;
}

/** 1.250.000₫ → 1,25 tr — for chart axes and tight stat tiles. */
export function formatCompactVND(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} tr`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

function trim(value: number): string {
  return value
    .toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
}

/**
 * Reads what someone types into the quick-entry field. Accepts "35k", "1tr2",
 * "1.250.000" and "1,25tr" because nobody types full digits on a phone.
 */
export function parseAmountInput(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;

  const compound = text.match(/^(\d+)(tr|m)(\d+)$/);
  if (compound) {
    const [, whole, , fraction] = compound;
    return Number(whole) * 1_000_000 + Number(fraction) * (fraction!.length === 1 ? 100_000 : 10_000);
  }

  const suffixed = text.match(/^(\d+(?:[.,]\d+)?)(k|tr|m|ty|tỷ|b)$/);
  if (suffixed) {
    const [, numeric, unit] = suffixed;
    const value = Number(numeric!.replace(',', '.'));
    if (!Number.isFinite(value)) return null;
    const multiplier = unit === 'k' ? 1_000 : unit === 'tr' || unit === 'm' ? 1_000_000 : 1_000_000_000;
    return Math.round(value * multiplier);
  }

  const digits = text.replace(/[.,\s₫đ]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

/**
 * The household lives in one timezone. Vercel runs its functions in UTC and
 * Supabase stores in UTC, so without pinning this, every "today" and "this
 * month" worked out on the server is a day behind between midnight and 7am —
 * and a whole month behind on the first of the month, which is exactly when the
 * overview is being read.
 */
export const HOUSEHOLD_TZ = 'Asia/Ho_Chi_Minh';

// en-CA renders as YYYY-MM-DD, the shape a Postgres `date` column takes.
const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOUSEHOLD_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today as the household's calendar reads it, wherever this code runs. */
export function todayInput(at: Date = new Date()): string {
  return ymd.format(at);
}

/** The household's civil date, split up for month arithmetic. */
export function householdParts(at: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = todayInput(at).split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

const dateLong = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: HOUSEHOLD_TZ,
});
const dateShort = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  timeZone: HOUSEHOLD_TZ,
});
const monthLabel = new Intl.DateTimeFormat('vi-VN', {
  month: 'long',
  year: 'numeric',
  timeZone: HOUSEHOLD_TZ,
});

export function formatDate(value: string | Date): string {
  return dateLong.format(toDate(value));
}

export function formatDateShort(value: string | Date): string {
  return dateShort.format(toDate(value));
}

export function formatMonth(value: string | Date): string {
  return monthLabel.format(toDate(value));
}

export function formatRelativeDate(value: string | Date): string {
  const target = startOfDay(toDate(value));
  const today = householdParts();
  const diffDays = Math.round(
    (new Date(today.year, today.month - 1, today.day).getTime() - target.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays === -1) return 'Ngày mai';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} ngày trước`;
  return formatDateShort(target);
}

/** `YYYY-MM-DD` in local time — Postgres `date` columns have no timezone. */
export function toDateInput(value: string | Date = new Date()): string {
  const date = toDate(value);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function monthRange(reference: Date = new Date()): { from: string; to: string } {
  const { year, month } = householdParts(reference);
  // Day 0 of the next month is the last day of this one. Built through Date.UTC
  // so the zone the server happens to run in cannot shift the boundary.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (value: number) => `${value}`.padStart(2, '0');

  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // A bare `YYYY-MM-DD` is a civil date, not an instant. Anchoring it at noon
  // UTC puts it half a day from either edge, so neither the household's +7 nor
  // a server running in UTC can read it as the day before or after. Midnight —
  // UTC's or the server's — is one timezone away from being the wrong date.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
