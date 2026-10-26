import { formatSigned } from '@/lib/formatters';
import type { TransactionWithRelations } from '@/types';

interface TransactionCardProps {
  transaction: TransactionWithRelations;
  walletName?: string;
}

export default function TransactionCard({ transaction, walletName }: TransactionCardProps) {
  const { type, amount, note, category, author, source } = transaction;

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-lg"
      >
        {category?.icon ?? (type === 'income' ? '💰' : '📦')}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {note || category?.name || (type === 'income' ? 'Khoản thu' : 'Khoản chi')}
        </p>
        <p className="truncate text-xs text-muted">
          {[category?.name, walletName, author?.display_name].filter(Boolean).join(' · ')}
          {source === 'ai_receipt' && ' · 📷'}
        </p>
      </div>

      <span
        className={`tabular shrink-0 text-sm font-semibold ${
          type === 'income' ? 'text-income' : 'text-expense'
        }`}
      >
        {formatSigned(amount, type)}
      </span>
    </li>
  );
}
