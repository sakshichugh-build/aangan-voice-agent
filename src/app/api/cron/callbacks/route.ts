import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/http/cron-auth';
import { env } from '@/lib/env';

export const maxDuration = 60;

/**
 * Processes due callbacks. If Vaani outbound is available (Phase 4) it would place
 * the call; until then it creates a front-desk task fallback (brief §3). Max 2
 * attempts; outside the callback window the SLA/scheduling already deferred it.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseAdmin();
  const now = new Date();
  const actions: string[] = [];

  const { data: due } = await db
    .from('callbacks')
    .select('id,lead_id,call_id,attempts,max_attempts,reason')
    .eq('status', 'pending')
    .lte('scheduled_for', now.toISOString())
    .limit(20);

  const vaaniOutbound = !!env.vaaniApiKey(); // Phase 4 wires real outbound

  for (const cb of due ?? []) {
    const attempts = (cb.attempts ?? 0) + 1;
    if (vaaniOutbound) {
      // TODO(Phase 4): place outbound call via VoiceProvider.placeCallback()
      await db.from('callbacks').update({ attempts, status: 'in_progress' }).eq('id', cb.id);
      actions.push(`outbound-queued ${cb.id}`);
    } else {
      // Fallback: front-desk task to call the person back.
      await db.from('tasks').insert({
        type: 'callback_fallback', call_id: cb.call_id, lead_id: cb.lead_id, assigned_role: 'front_desk',
        title: 'Call back missed enquiry', notes: `Missed/dropped call (${cb.reason}). Attempt ${attempts}.`,
      });
      const done = attempts >= (cb.max_attempts ?? 2);
      await db.from('callbacks').update({ attempts, status: done ? 'completed' : 'pending', scheduled_for: new Date(now.getTime() + 3 * 3600_000).toISOString() }).eq('id', cb.id);
      actions.push(`task-fallback ${cb.id}`);
    }
  }

  return NextResponse.json({ ok: true, actions });
}
