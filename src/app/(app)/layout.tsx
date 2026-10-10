import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabaseServer } from '@/lib/supabase/server';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/cost', label: 'Cost' },
  { href: '/guardrails', label: 'Guardrails' },
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
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold text-neutral-900">Aangan Studio</Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-neutral-600 hover:text-neutral-900">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
            <span className="hidden sm:inline">{profile?.email ?? user.email} · {role}</span>
            <form action="/auth/signout" method="post">
              <button className="hover:text-neutral-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
