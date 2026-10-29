import { formatVND } from '@/lib/formatters';

interface BalanceCardProps {
  balance: number;
  income: number;
  expense: number;
  monthLabel: string;
}

export default function BalanceCard({ balance, income, expense, monthLabel }: BalanceCardProps) {
  const net = income - expense;

  return (
    <section className="card" aria-label="Số dư và thu chi">
      {/* Personal wallets only: the family fund records spending, not savings. */}
      <p className="text-sm text-muted">Tổng số dư ví cá nhân</p>
      <p className="tabular mt-1 text-[34px] font-semibold leading-none tracking-tight">
        {formatVND(balance)}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-bg p-3">
          <dt className="text-xs text-muted">Thu {monthLabel}</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-income">{formatVND(income)}</dd>
        </div>
        <div className="rounded-xl bg-bg p-3">
          <dt className="text-xs text-muted">Chi {monthLabel}</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-expense">{formatVND(expense)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-muted">
        {net === 0
          ? 'Tháng này thu chi cân bằng.'
          : net > 0
            ? `Tháng này dư ${formatVND(net)}.`
            : `Tháng này âm ${formatVND(Math.abs(net))}.`}
      </p>
    </section>
  );
}
