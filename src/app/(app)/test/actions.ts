'use server';

import { supabaseServer } from '@/lib/supabase/server';
import { ingestCall } from '@/lib/pipeline/ingest';
import { runPostCallPipeline } from '@/lib/pipeline/post-call';

async function requireStaff() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['founder', 'front_desk'].includes(profile.role)) throw new Error('forbidden');
}

export interface SimulateResult {
  ok: boolean;
  callId?: string;
  outcome?: string;
  error?: string;
}

/**
 * Runs the full post-call pipeline on a transcript, exactly as a real Vaani call
 * would after hang-up: store → extract (Gemini) → rules → guardrails → cost →
 * route (handoff/escalation/nurture/callback). Returns the outcome + call id.
 */
export async function simulateCall(transcript: string, phone: string): Promise<SimulateResult> {
  try {
    await requireStaff();
    if (!transcript.trim()) return { ok: false, error: 'Transcript is empty.' };
    const providerCallId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await ingestCall({
      providerCallId,
      provider: 'test',
      phone: phone || null,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: 240,
      status: 'completed',
      transcript,
      enqueue: false, // run inline so the demo is immediate
    });
    const res = await runPostCallPipeline(providerCallId);
    return { ok: true, callId: res.callId, outcome: res.outcome };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/RESOURCE_EXHAUSTED|quota|429/i.test(msg)) {
      return { ok: false, error: 'Gemini free-tier quota reached (20/day). Try again after it resets, or enable billing.' };
    }
    return { ok: false, error: msg };
  }
}
