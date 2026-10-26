import Link from 'next/link';
import { formatSigned } from '@/lib/formatters';
import type { TransactionWithRelations } from '@/types';

interface TransactionCardProps {
  transaction: TransactionWithRelations;
  walletName?: string;
  /** Only the author may change a row, so only they get the tap target. */
  editable?: boolean;
}

export default function TransactionCard({
  transaction,
  walletName,
  editable = false,
}: TransactionCardProps) {
  const { id, type, amount, note, category, author, source } = transaction;

  const body = (
    <>
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-lg"
      >
        {category?.icon ?? (type === 'income' ? '💰' : '📦')}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {note || category?.name || (type === 'income' ? 'Khoản thu' : 'Khoản chi')}
        </span>
        <span className="block truncate text-xs text-muted">
          {[category?.name, walletName, author?.display_name].filter(Boolean).join(' · ')}
          {source === 'ai_receipt' && ' · 📷'}
        </span>
      </span>

      <span
        className={`tabular shrink-0 text-sm font-semibold ${
          type === 'income' ? 'text-income' : 'text-expense'
        }`}
      >
        {formatSigned(amount, type)}
      </span>

      {editable && (
        <span aria-hidden className="shrink-0 text-muted">
          ›
        </span>
      )}
    </>
  );

  return (
    <li>
      {editable ? (
        <Link
          href={`/transactions/${id}`}
          className="tap -mx-1 flex items-center gap-3 rounded-xl px-1 py-3"
        >
          {body}
        </Link>
      ) : (
        <span className="flex items-center gap-3 py-3">{body}</span>
      )}
    </li>
  );
}
