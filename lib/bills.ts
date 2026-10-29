import { householdParts, toDateInput } from '@/lib/formatters';
import type { BillStatus, BillWithStatus, RecurringBill } from '@/types';

/** A bill counts as "sắp đến hạn" inside this window. */
export const DUE_SOON_DAYS = 7;

/**
 * How far ahead the daily reminder looks. Wider than the badge on screen: a
 * notification is read once and then gone, so it has to arrive early enough to
 * still be worth acting on, while the screen can afford to wait until the
 * thing is actually close.
 */
export const REMINDER_BILL_DAYS = 10;

const MONTHS_PER_CYCLE: Record<RecurringBill['cycle'], number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Clamps day 31 onto the last day of a shorter month rather than overflowing. */
function dayInMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay));
}

/**
 * The occurrence on or before today, and the one after it.
 *
 * Both are needed: an unpaid bill is judged against the date that has already
 * passed, while a settled one should show the date coming up. Looking only
 * forward would report a bill that lapsed on the 10th as comfortably due next
 * month.
 */
function occurrencesAround(bill: RecurringBill, today: Date): { last: Date; next: Date } {
  const step = MONTHS_PER_CYCLE[bill.cycle];
  const anchorMonth = bill.cycle === 'monthly' ? 0 : (bill.due_month ?? 1) - 1;
  const anchorIndex = today.getFullYear() * 12 + anchorMonth;

  const at = (k: number) => {
    const index = anchorIndex + k * step;
    return dayInMonth(Math.floor(index / 12), index % 12, bill.due_day);
  };

  let k = Math.floor((today.getFullYear() * 12 + today.getMonth() - anchorIndex) / step);
  while (at(k) > today) k -= 1;
  while (at(k + 1) <= today) k += 1;

  return { last: at(k), next: at(k + 1) };
}

export function describeBill(bill: RecurringBill, now = new Date()): BillWithStatus {
  // Which day it is has to be the household's answer, not the server's: this
  // runs in a Server Component, where "today" would otherwise be the UTC date
  // and every bill would read a day early from midnight to 7am.
  const stamp = householdParts(now);
  const today = new Date(stamp.year, stamp.month - 1, stamp.day);
  const { last, next } = occurrencesAround(bill, today);

  const paidOn = bill.last_paid_on ? new Date(`${bill.last_paid_on}T00:00:00`) : null;
  const born = householdParts(new Date(bill.created_at));
  const createdDay = new Date(born.year, born.month - 1, born.day);

  // A due date that fell before the bill was ever entered was never owed, so a
  // bill added today is not born overdue.
  const owed = last >= createdDay;
  const settled = paidOn !== null && paidOn >= last;

  let due: Date;
  let status: BillStatus;

  if (!owed) {
    due = next;
    const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    status = daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'upcoming';
  } else if (settled) {
    due = next;
    // "Đã đóng" describes the cycle just closed. Once the following one is days
    // away that label hides what the household still has to do, so the upcoming
    // date takes over.
    const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    status = daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'paid';
  } else {
    due = last;
    // Falling due today is not yet late.
    status = last.getTime() === today.getTime() ? 'due_soon' : 'overdue';
  }

  return {
    bill,
    status,
    dueOn: toDateInput(due),
    daysLeft: Math.round((due.getTime() - today.getTime()) / 86_400_000),
  };
}

export const STATUS_LABEL: Record<BillStatus, string> = {
  paid: 'Đã đóng',
  overdue: 'Quá hạn',
  due_soon: 'Sắp đến hạn',
  upcoming: 'Còn hạn',
};

export const CYCLE_LABEL: Record<RecurringBill['cycle'], string> = {
  monthly: 'Hàng tháng',
  quarterly: 'Hàng quý',
  yearly: 'Hàng năm',
};

/** Overdue first, then nearest due — what the household needs to act on. */
export function sortBills(bills: BillWithStatus[]): BillWithStatus[] {
  const rank: Record<BillStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, paid: 3 };
  return bills.slice().sort((a, b) => rank[a.status] - rank[b.status] || a.daysLeft - b.daysLeft);
}
