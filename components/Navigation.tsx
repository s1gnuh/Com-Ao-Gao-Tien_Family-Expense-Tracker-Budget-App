'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function IconOverview() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" {...STROKE}>
      <path d="M4 19V11M9.5 19V5M15 19v-6M20.5 19V8" />
    </svg>
  );
}

function IconTransactions() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" {...STROKE}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V4a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" {...STROKE}>
      <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M16 11h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4Z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" {...STROKE}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.1 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.3a1.8 1.8 0 1 1-3.6 0V20a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9H4a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3H9.6a1.5 1.5 0 0 0 .9-1.4V4a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.3a1.8 1.8 0 1 1 0 3.6H20a1.5 1.5 0 0 0-1.4.9Z" />
    </svg>
  );
}

const TABS = [
  { href: '/', label: 'Tổng quan', Icon: IconOverview },
  { href: '/transactions', label: 'Giao dịch', Icon: IconTransactions },
  { href: '/wallets', label: 'Ví & Quỹ', Icon: IconWallet },
  { href: '/settings', label: 'Cài đặt', Icon: IconSettings },
] as const;

export default function Navigation() {
  const pathname = usePathname();
  const addActive = pathname.startsWith('/transactions/add');

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    if (href === '/transactions') return pathname === '/transactions';
    return pathname.startsWith(href);
  }

  const [first, second, third, fourth] = TABS;

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch" style={{ height: 'var(--nav-h)' }}>
        <Tab {...first} active={isActive(first.href)} />
        <Tab {...second} active={isActive(second.href)} />

        <li className="flex-1">
          <Link
            href="/transactions/add"
            aria-label="Nhập nhanh giao dịch"
            aria-current={addActive ? 'page' : undefined}
            className="tap flex h-full flex-col items-center justify-center gap-1"
          >
            <span
              className={`-mt-6 flex h-12 w-12 items-center justify-center rounded-full text-brand-ink shadow-lg ring-4 ring-surface ${
                addActive ? 'bg-accent' : 'bg-brand'
              }`}
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7" {...STROKE} strokeWidth={2.2}>
                <path d="M12 5.5v13M5.5 12h13" />
              </svg>
            </span>
            <span className={`text-[10px] font-medium ${addActive ? 'text-brand-strong' : 'text-muted'}`}>
              Nhập nhanh
            </span>
          </Link>
        </li>

        <Tab {...third} active={isActive(third.href)} />
        <Tab {...fourth} active={isActive(fourth.href)} />
      </ul>
    </nav>
  );
}

interface TabProps {
  href: string;
  label: string;
  Icon: () => React.JSX.Element;
  active: boolean;
}

function Tab({ href, label, Icon, active }: TabProps) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`tap flex h-full flex-col items-center justify-center gap-0.5 ${
          active ? 'text-brand-strong' : 'text-muted'
        }`}
      >
        <Icon />
        <span className="text-[10px] font-medium">{label}</span>
      </Link>
    </li>
  );
}
