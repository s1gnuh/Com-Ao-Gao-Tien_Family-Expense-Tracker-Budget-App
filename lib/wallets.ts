import type { TransactionType, Wallet } from '@/types';

type WalletLike = Pick<Wallet, 'id' | 'type'> & { owner_id?: string | null };

/**
 * Which wallets a row of this kind may go in. Income belongs to a person, so
 * the family fund is not on offer for it — the database says the same thing in
 * enforce_income_is_personal(), this is only what keeps it off the screen.
 */
export function walletsForType<T extends WalletLike>(wallets: T[], type: TransactionType): T[] {
  return type === 'income' ? wallets.filter((wallet) => wallet.type === 'personal') : wallets;
}

/**
 * Spending defaults to the family fund, which is what the household actually
 * wants totalled; income defaults to the wallet belonging to whoever is
 * entering it. Falls back to anything allowed rather than leaving the form with
 * no wallet picked at all.
 */
export function defaultWalletId<T extends WalletLike>(
  wallets: T[],
  type: TransactionType,
  userId: string | null,
): string {
  const allowed = walletsForType(wallets, type);

  if (type === 'income') {
    const own = allowed.find((wallet) => wallet.owner_id && wallet.owner_id === userId);
    return own?.id ?? allowed[0]?.id ?? '';
  }

  const shared = allowed.find((wallet) => wallet.type === 'shared');
  return shared?.id ?? allowed[0]?.id ?? '';
}
