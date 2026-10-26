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

const dateLong = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateShort = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' });
const monthLabel = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' });

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
  const diffDays = Math.round((startOfDay(new Date()).getTime() - target.getTime()) / 86_400_000);
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
  const from = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const to = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Bare `YYYY-MM-DD` parses as UTC midnight, which shifts a day in UTC+7.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
