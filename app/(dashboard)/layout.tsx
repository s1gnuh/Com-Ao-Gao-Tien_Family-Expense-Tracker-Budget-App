import Link from 'next/link';
import Navigation from '@/components/Navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 px-4 pt-safe-t pb-28">{children}</main>

      <Link
        href="/transactions/add"
        aria-label="Thêm giao dịch"
        className="tap fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-white shadow-lg"
      >
        +
      </Link>

      <Navigation />
    </div>
  );
}
