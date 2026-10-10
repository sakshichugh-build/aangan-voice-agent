import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabaseServer } from '@/lib/supabase/server';
import { NavLink } from '@/components/nav-link';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/cost', label: 'Cost' },
  { href: '/guardrails', label: 'Guardrails' },
  { href: '/test', label: 'Test call' },
  { href: '/settings', label: 'Settings' },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,email,full_name').eq('id', user.id).maybeSingle();
  const role = profile?.role ?? 'front_desk';

  // Designers use email action links, not the dashboard.
  if (role === 'designer') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold">Aangan Studio</h1>
          <p className="mt-2 text-sm text-neutral-600">You receive leads by email with one-tap actions. The dashboard is for the front desk and founder.</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button className="text-sm text-neutral-500 hover:text-neutral-900">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 pr-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm">आ</span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">Aangan Studio</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-soft">
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500" />
              {profile?.email ?? user.email} · <span className="font-medium capitalize text-ink">{role.replace('_', ' ')}</span>
            </span>
            <form action="/auth/signout" method="post">
              <button className="rounded-full px-3 py-1.5 font-medium text-ink-soft transition hover:bg-brand-50 hover:text-brand-700">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7">{children}</main>
    </div>
  );
}
