'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm'
          : 'rounded-full px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-brand-50 hover:text-brand-700'
      }
    >
      {label}
    </Link>
  );
}
