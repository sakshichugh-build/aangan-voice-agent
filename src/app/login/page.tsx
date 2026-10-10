'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const supabase = supabaseBrowser();
    const next = new URLSearchParams(window.location.search).get('next') || '/';
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-8 shadow-[0_8px_40px_-12px_rgba(28,25,23,0.18)]">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white shadow-sm">आ</span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">Aangan Studio</h1>
            <p className="text-xs text-ink-soft">Never-Miss enquiry console</p>
          </div>
        </div>

        {status === 'sent' ? (
          <div className="mt-2 rounded-xl bg-accent-50 p-4 text-sm text-accent-700 ring-1 ring-inset ring-accent-100">
            Check <strong>{email}</strong> for a magic link to sign in.
          </div>
        ) : (
          <form onSubmit={sendLink} className="mt-2 space-y-3">
            <label className="block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@aangan.studio"
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {status === 'error' && <p className="text-sm text-red-600">{message}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
