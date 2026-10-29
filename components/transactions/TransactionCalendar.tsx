'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import TransactionCard from './TransactionCard';
import { formatCompactVND, formatDate, formatVND, todayInput } from '@/lib/formatters';
import type { TransactionWithRelations } from '@/types';

export interface DayTotal {
  day: string;
  income: number;
  expense: number;
  tx_count: number;
}

interface TransactionCalendarProps {
  /** First day of the displayed month, as YYYY-MM-DD. */
  monthStart: string;
  dailyTotals: DayTotal[];
  transactions: TransactionWithRelations[];
  walletNames: Record<string, string>;
  prevMonth: string;
  nextMonth: string;
  monthLabel: string;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function TransactionCalendar({
  monthStart,
  dailyTotals,
  transactions,
  walletNames,
  prevMonth,
  nextMonth,
  monthLabel,
}: TransactionCalendarProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const totalsByDay = useMemo(
    () => new Map(dailyTotals.map((total) => [total.day, total])),
    [dailyTotals],
  );

  const cells = useMemo(() => buildCells(monthStart), [monthStart]);
  const today = todayInput();

  const monthIncome = dailyTotals.reduce((sum, day) => sum + Number(day.income), 0);
  const monthExpense = dailyTotals.reduce((sum, day) => sum + Number(day.expense), 0);

  const visible = selected
    ? transactions.filter((transaction) => transaction.occurred_at === selected)
    : transactions;

  return (
    <div className="space-y-4">
      <section className="card">
        <header className="mb-3 flex items-center justify-between">
          <Link
            href={`/transactions?m=${prevMonth}`}
            aria-label="Tháng trước"
            className="tap flex h-9 w-9 items-center justify-center rounded-full text-muted"
          >
            ‹
          </Link>
          <p className="text-sm font-medium capitalize">{monthLabel}</p>
          <Link
            href={`/transactions?m=${nextMonth}`}
            aria-label="Tháng sau"
            className="tap flex h-9 w-9 items-center justify-center rounded-full text-muted"
          >
            ›
          </Link>
        </header>

        <div aria-hidden className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, index) => {
            if (!cell) return <span key={`pad-${index}`} />;

            const total = totalsByDay.get(cell);
            const isSelected = selected === cell;
            const expense = Number(total?.expense ?? 0);
            const income = Number(total?.income ?? 0);

            return (
              <button
                key={cell}
                type="button"
                onClick={() => setSelected(isSelected ? null : cell)}
                aria-pressed={isSelected}
                aria-label={`${formatDate(cell)}${
                  total ? `, chi ${formatVND(expense)}, thu ${formatVND(income)}` : ', không có giao dịch'
                }`}
                className={`tap flex min-h-[44px] flex-col items-center justify-center rounded-lg border text-[11px] ${
                  isSelected
                    ? 'border-brand bg-brand/10'
                    : cell === today
                      ? 'border-brand/40 bg-transparent'
                      : 'border-transparent bg-bg'
                }`}
              >
                <span className={cell === today ? 'font-bold text-brand-strong' : 'font-medium'}>
                  {Number(cell.slice(8))}
                </span>
                {expense > 0 ? (
                  <span className="tabular text-[9px] leading-tight text-expense">
                    {formatCompactVND(expense)}
                  </span>
                ) : income > 0 ? (
                  <span className="tabular text-[9px] leading-tight text-income">
                    {formatCompactVND(income)}
                  </span>
                ) : (
                  <span className="text-[9px] leading-tight text-transparent">·</span>
                )}
              </button>
            );
          })}
        </div>

        <dl className="mt-3 flex justify-between border-t border-border pt-3 text-xs">
          <div className="flex gap-1.5">
            <dt className="text-muted">Thu tháng:</dt>
            <dd className="tabular font-medium text-income">{formatVND(monthIncome)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Chi tháng:</dt>
            <dd className="tabular font-medium text-expense">{formatVND(monthExpense)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <header className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            {selected ? formatDate(selected) : 'Cả tháng'}
            <span className="ml-1.5 font-normal text-muted">({visible.length})</span>
          </h2>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="tap text-xs font-medium text-brand-strong"
            >
              Bỏ lọc
            </button>
          )}
        </header>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            {selected ? 'Ngày này chưa có giao dịch.' : 'Tháng này chưa có giao dịch nào.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                walletName={walletNames[transaction.wallet_id]}
                editable
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Month grid padded to a Monday start; null marks a leading blank. */
function buildCells(monthStart: string): (string | null)[] {
  const start = new Date(`${monthStart}T00:00:00`);
  const year = start.getFullYear();
  const month = start.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // getDay() is Sunday-based; shift so Monday is 0.
  const leading = (start.getDay() + 6) % 7;

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${`${month + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`);
  }
  return cells;
}
