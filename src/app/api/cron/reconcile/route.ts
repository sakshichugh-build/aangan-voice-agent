import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/http/cron-auth';

export const maxDuration = 60;

/**
 * Reconcile cron (every 5 min). Safety net for the "our API was down" case:
 * re-enqueue post-call jobs for completed calls that never produced a
 * qualification. Phase 4 adds pulling missed calls from Vaani's call log.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - 5 * 60000).toISOString(); // settled >5 min ago
  const requeued: string[] = [];

  const { data: calls } = await db
    .from('calls')
    .select('id,provider_call_id,provider')
    .eq('status', 'completed')
    .lt('created_at', cutoff)
    .limit(50);

  for (const call of calls ?? []) {
    const { data: q } = await db.from('qualifications').select('id').eq('call_id', call.id).maybeSingle();
    if (q) continue; // already processed
    const { data: job } = await db.from('jobs').select('id,status').eq('provider_call_id', call.provider_call_id).maybeSingle();
    if (job && job.status !== 'dead') continue; // job exists and not dead
    // (Re)enqueue
    await db.from('jobs').upsert(
      { type: 'post_call_pipeline', call_id: call.id, provider_call_id: call.provider_call_id, status: 'pending', run_after: new Date().toISOString() },
      { onConflict: 'type,provider_call_id' },
    );
    requeued.push(call.provider_call_id);
  }

  return NextResponse.json({ ok: true, requeued });
}
