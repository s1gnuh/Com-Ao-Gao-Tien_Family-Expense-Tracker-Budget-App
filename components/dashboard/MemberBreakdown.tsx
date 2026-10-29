import { formatVND } from '@/lib/formatters';

export interface MemberRow {
  user_id: string;
  display_name: string;
  avatar_emoji: string | null;
  income: number;
  expense: number;
  tx_count: number;
}

/**
 * Who put what through the book this month. Anyone may edit anyone's row now,
 * so created_by stopped being a permission and became this instead.
 */
export default function MemberBreakdown({
  rows,
  monthLabel,
}: {
  rows: MemberRow[];
  monthLabel: string;
}) {
  const active = rows.filter((row) => Number(row.tx_count) > 0);
  const peak = Math.max(...active.map((row) => Number(row.expense)), 0);

  return (
    <section className="card" aria-label={`Chi tiêu theo người ${monthLabel}`}>
      <h2 className="mb-3 text-sm font-medium">Ai chi bao nhiêu {monthLabel}</h2>

      {active.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Tháng này chưa ai ghi khoản nào.</p>
      ) : (
        <ul className="space-y-3">
          {active.map((row) => {
            const expense = Number(row.expense);
            const income = Number(row.income);

            return (
              <li key={row.user_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">
                    <span aria-hidden className="mr-1.5">
                      {row.avatar_emoji ?? '🙂'}
                    </span>
                    {row.display_name}
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatVND(expense)}
                  </span>
                </div>

                <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg">
                  <div
                    className="h-full rounded-full"
                    style={{
                      // A real but tiny amount still deserves a mark rather than
                      // rounding away to an empty track.
                      width: expense > 0 ? `max(3px, ${(expense / peak) * 100}%)` : 0,
                      backgroundColor: 'rgb(var(--c-series-out))',
                    }}
                  />
                </div>

                <p className="mt-1 text-[11px] text-muted">
                  {Number(row.tx_count)} khoản
                  {income > 0 && ` · thu ${formatVND(income)}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
