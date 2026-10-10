import { supabaseServer } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">Aangan Studio</h1>
            <p className="text-xs text-neutral-500">Never-Miss enquiry console</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-neutral-500 hover:text-neutral-900">Sign out</button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-base font-semibold text-neutral-900">Phase 1 — Scaffold ✅</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Signed in as <strong>{user?.email ?? 'unknown'}</strong>. Database schema, RLS,
            seed, and auth are live. The dashboard pages (Overview, Cost, Inbox, Lead detail,
            Guardrails, Settings) arrive in Phase 5.
          </p>
          <ul className="mt-4 list-disc pl-5 text-sm text-neutral-600 space-y-1">
            <li>Next.js (App Router, TS) on Vercel + Supabase (Postgres, Auth, pg_cron)</li>
            <li>AI extracts, code decides — deterministic rules engine</li>
            <li>pricing.md never reaches the agent; post-call guardrails scan for leaks</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
