import { formatCompactVND, formatVND } from '@/lib/formatters';

export interface CashFlowPoint {
  label: string;
  thu: number;
  chi: number;
}

const SERIES = [
  { key: 'thu' as const, name: 'Thu', color: 'rgb(var(--c-series-in))' },
  { key: 'chi' as const, name: 'Chi', color: 'rgb(var(--c-series-out))' },
];

const PLOT_HEIGHT = 160;
const GRID_LINES = 4;

export default function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const peak = Math.max(...data.flatMap((point) => [point.thu, point.chi]), 0);
  const scaleMax = niceCeiling(peak);
  const latest = data[data.length - 1];

  return (
    <section className="card" aria-label="Dòng tiền 6 tháng gần nhất">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Dòng tiền 6 tháng</h2>
        <ul className="flex gap-3">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5 text-xs text-muted">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: series.color }}
              />
              {series.name}
            </li>
          ))}
        </ul>
      </div>

      {scaleMax === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Chưa có giao dịch nào để vẽ biểu đồ.
        </p>
      ) : (
        <div className="flex gap-2">
          <div
            aria-hidden
            className="flex w-12 shrink-0 flex-col justify-between text-right text-[10px] text-muted"
            style={{ height: PLOT_HEIGHT }}
          >
            {Array.from({ length: GRID_LINES + 1 }, (_, index) => (
              <span key={index} className="tabular leading-none">
                {formatCompactVND((scaleMax / GRID_LINES) * (GRID_LINES - index))}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: PLOT_HEIGHT }}>
              {Array.from({ length: GRID_LINES + 1 }, (_, index) => (
                <div
                  key={index}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-border"
                  style={{ top: `${(index / GRID_LINES) * 100}%` }}
                />
              ))}

              <div className="absolute inset-0 flex items-end justify-between gap-1">
                {data.map((point) => (
                  <div key={point.label} className="flex h-full flex-1 items-end justify-center gap-[2px]">
                    {SERIES.map((series) => (
                      <div
                        key={series.key}
                        className="w-full max-w-[10px] rounded-t"
                        style={{
                          height: barHeight(point[series.key], scaleMax),
                          backgroundColor: series.color,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-1.5 flex justify-between gap-1">
              {data.map((point) => (
                <span
                  key={point.label}
                  className={`flex-1 text-center text-[10px] ${
                    point.label === latest?.label ? 'font-semibold text-fg' : 'text-muted'
                  }`}
                >
                  {point.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {latest && scaleMax > 0 && (
        <p className="mt-3 text-xs text-muted">
          {latest.label}: thu <span className="tabular text-fg">{formatVND(latest.thu)}</span> · chi{' '}
          <span className="tabular text-fg">{formatVND(latest.chi)}</span>
        </p>
      )}

      <details className="mt-3">
        <summary className="tap cursor-pointer text-xs text-muted">Xem bảng số liệu</summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 text-left font-medium">
                Tháng
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Thu
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Chi
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((point) => (
              <tr key={point.label} className="border-t border-border">
                <th scope="row" className="py-1 text-left font-normal">
                  {point.label}
                </th>
                <td className="py-1 text-right">{formatCompactVND(point.thu)}</td>
                <td className="py-1 text-right">{formatCompactVND(point.chi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** Keeps a tiny non-zero amount visible instead of collapsing it to nothing. */
function barHeight(value: number, scaleMax: number): string {
  if (value <= 0) return '0';
  return `max(2px, ${(value / scaleMax) * 100}%)`;
}

/** Rounds the axis top up to 1/2/5 × 10ⁿ so gridline labels stay readable. */
function niceCeiling(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
