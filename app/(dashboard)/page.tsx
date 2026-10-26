import { formatMonth } from '@/lib/formatters';

export default function DashboardPage() {
  return (
    <div className="space-y-4 py-4">
      <header>
        <p className="text-sm text-muted">{formatMonth(new Date())}</p>
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
      </header>

      <section className="card">
        <p className="text-sm text-muted">Số dư — chờ kết nối Supabase</p>
      </section>

      <section className="card">
        <p className="text-sm text-muted">Dòng tiền — chờ CashFlowChart</p>
      </section>
    </div>
  );
}
