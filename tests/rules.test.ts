import { describe, expect, it } from 'vitest';
import { describeBill } from '@/lib/bills';
import { findIncomeCategory, matchCategory } from '@/lib/categories';
import { defaultWalletId, walletsForType } from '@/lib/wallets';
import type { Category, RecurringBill } from '@/types';

const wallets = [
  { id: 'fund', type: 'shared' as const, owner_id: null },
  { id: 'bo', type: 'personal' as const, owner_id: 'u-bo' },
  { id: 'me', type: 'personal' as const, owner_id: 'u-me' },
];

describe('wallet rules', () => {
  it('never offers the family fund for income', () => {
    expect(walletsForType(wallets, 'income').map((wallet) => wallet.id)).toEqual(['bo', 'me']);
    expect(walletsForType(wallets, 'expense')).toHaveLength(3);
  });

  it('defaults spending to the fund and income to your own wallet', () => {
    expect(defaultWalletId(wallets, 'expense', 'u-me')).toBe('fund');
    expect(defaultWalletId(wallets, 'income', 'u-me')).toBe('me');
  });
});

const categories = [
  { id: 'food', name: 'Ăn uống' },
  { id: 'in', name: 'Thu nhập' },
  { id: 'misc', name: 'Khác' },
] as Category[];

describe('category matching', () => {
  it('matches Gemini’s unaccented labels', () => {
    expect(matchCategory('An uong', categories)?.id).toBe('food');
    expect(matchCategory('Thu nhap', categories)?.id).toBe('in');
    expect(matchCategory('nonsense', categories)).toBeUndefined();
  });

  it('finds the income category', () => {
    expect(findIncomeCategory(categories)?.id).toBe('in');
  });
});

function bill(overrides: Partial<RecurringBill>): RecurringBill {
  return {
    id: 'b',
    wallet_id: 'fund',
    category_id: null,
    name: 'Tiền điện',
    amount: 500_000,
    cycle: 'monthly',
    due_day: 10,
    due_month: null,
    assignee_id: null,
    last_paid_on: null,
    is_active: true,
    created_by: 'u-bo',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('describeBill', () => {
  // 2026-05-12 08:00 in Vietnam.
  const now = new Date('2026-05-12T01:00:00Z');

  it('is overdue when this month’s date passed unpaid', () => {
    const result = describeBill(bill({}), now);
    expect(result.status).toBe('overdue');
    expect(result.dueOn).toBe('2026-05-10');
    expect(result.daysLeft).toBe(-2);
  });

  it('is paid once settled on or after the due date', () => {
    expect(describeBill(bill({ last_paid_on: '2026-05-10' }), now).status).toBe('paid');
  });

  it('is not born overdue when added after the due date', () => {
    const result = describeBill(bill({ created_at: '2026-05-11T03:00:00Z' }), now);
    expect(result.status).toBe('upcoming');
    expect(result.dueOn).toBe('2026-06-10');
  });

  it('lands day 31 on the last day of a short month', () => {
    const result = describeBill(bill({ due_day: 31, created_at: '2026-01-01T00:00:00Z', last_paid_on: '2026-04-30' }), now);
    expect(result.dueOn).toBe('2026-05-31');
  });
});
