'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { simulateCall, type SimulateResult } from './actions';
import { SAMPLE_TRANSCRIPTS } from '@/lib/dev/transcripts';

export function TestCallForm() {
  const [text, setText] = useState(SAMPLE_TRANSCRIPTS[0]?.text ?? '');
  const [phone, setPhone] = useState('+9198000' + Math.floor(10000 + Math.random() * 89999));
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Sample transcript</label>
          <select
            onChange={(e) => { const s = SAMPLE_TRANSCRIPTS.find((t) => t.id === e.target.value); if (s) setText(s.text); setResult(null); }}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            defaultValue={SAMPLE_TRANSCRIPTS[0]?.id}
          >
            {SAMPLE_TRANSCRIPTS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Caller number (E.164)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Transcript (edit freely)</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} className="w-full rounded-lg border border-neutral-300 p-3 font-mono text-xs" />
        </div>
        <button
          disabled={pending}
          onClick={() => { setResult(null); start(async () => setResult(await simulateCall(text, phone))); }}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Running pipeline…' : 'Run call through the pipeline'}
        </button>
      </div>

      <div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">Result</h2>
          {!result && !pending && <p className="mt-2 text-sm text-neutral-500">Pick or paste a transcript and run it. This fires the real pipeline — extraction (Gemini), the deterministic rules engine, guardrails, cost ledger, and routing — exactly as a Vaani call would after hang-up.</p>}
          {pending && <p className="mt-2 text-sm text-neutral-500">Extracting with Gemini, applying rules, routing…</p>}
          {result && !result.ok && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.error}</p>}
          {result && result.ok && (
            <div className="mt-2 space-y-2 text-sm">
              <p>Outcome: <span className="font-semibold">{result.outcome?.replace(/_/g, ' ')}</span></p>
              <p className="text-neutral-600">The call now appears in the Inbox, with extracted fields, rule trace, SLA timeline and (for qualified leads) a handoff.</p>
              <div className="flex gap-3">
                {result.callId && <Link href={`/leads/${result.callId}`} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white">Open lead detail →</Link>}
                <Link href="/inbox" className="rounded-lg border border-neutral-300 px-3 py-1.5">Go to Inbox</Link>
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-neutral-400">Note: this is the text path (no phone). Real voice calls run through Vaani once connected (Phase 4). Each run uses one Gemini request (free tier: 20/day).</p>
      </div>
    </div>
  );
}
