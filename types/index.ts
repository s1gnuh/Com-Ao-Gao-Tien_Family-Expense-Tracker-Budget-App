export type WalletType = 'personal' | 'shared';
export type CategoryKind = 'fixed' | 'variable';
export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'manual' | 'ai_receipt';

export interface Profile {
  id: string;
  display_name: string;
  avatar_emoji: string | null;
  created_at: string;
}

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  /** Null exactly when `type` is 'shared' — enforced by a DB check constraint. */
  owner_id: string | null;
  currency: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  kind: CategoryKind;
  is_system: boolean;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  created_by: string;
  category_id: string | null;
  type: TransactionType;
  /** Always positive; direction comes from `type`. */
  amount: number;
  note: string | null;
  occurred_at: string;
  source: TransactionSource;
  receipt_url: string | null;
  created_at: string;
}

export type BillCycle = 'monthly' | 'quarterly' | 'yearly';

export interface RecurringBill {
  id: string;
  wallet_id: string;
  category_id: string | null;
  name: string;
  amount: number;
  cycle: BillCycle;
  due_day: number;
  due_month: number | null;
  assignee_id: string | null;
  last_paid_on: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export type BillStatus = 'paid' | 'overdue' | 'due_soon' | 'upcoming';

export interface BillWithStatus {
  bill: RecurringBill;
  status: BillStatus;
  /** Date the current cycle falls due, as YYYY-MM-DD. */
  dueOn: string;
  /** Negative once overdue. */
  daysLeft: number;
}

export interface Budget {
  id: string;
  wallet_id: string;
  category_id: string;
  limit_amount: number;
  period: 'monthly';
}

export interface TransactionWithRelations extends Transaction {
  category: Pick<Category, 'id' | 'name' | 'icon' | 'kind'> | null;
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_emoji'> | null;
}

export interface WalletSummary {
  wallet: Wallet;
  balance: number;
  income: number;
  expense: number;
}

export interface BudgetProgress {
  budget: Budget;
  category: Category;
  spent: number;
  remaining: number;
  ratio: number;
}

/** Shape `/api/ai/parse-receipt` returns on success. */
export interface ParsedReceipt {
  amount: number | null;
  /** Bank alerts can be money in; a shop receipt never is. */
  type: TransactionType;
  note: string | null;
  category_guess: string | null;
  occurred_at: string | null;
  confidence: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
