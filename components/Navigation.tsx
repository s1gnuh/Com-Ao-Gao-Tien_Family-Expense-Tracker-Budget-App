'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Tổng quan', icon: '📊' },
  { href: '/transactions', label: 'Giao dịch', icon: '🧾' },
  { href: '/wallets', label: 'Ví', icon: '👛' },
  { href: '/settings', label: 'Cài đặt', icon: '⚙️' },
] as const;

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-safe-b">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`tap flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                <span aria-hidden className="text-xl leading-none">
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
