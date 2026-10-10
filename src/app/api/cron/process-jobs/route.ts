import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/http/cron-auth';
import { runPostCallPipeline } from '@/lib/pipeline/post-call';

export const maxDuration = 60;

/** Drains the post-call job queue. Called every minute by Supabase pg_cron. */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: jobs } = await db
    .from('jobs')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('run_after', nowIso)
    .order('created_at', { ascending: true })
    .limit(10);

  const processed: { id: string; outcome?: string; error?: string }[] = [];

  for (const job of jobs ?? []) {
    // Optimistic lock: only proceed if we flip it to processing.
    const { data: locked } = await db
      .from('jobs')
      .update({ status: 'processing', locked_at: new Date().toISOString() })
      .eq('id', job.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (!locked) continue;

    try {
      const res = await runPostCallPipeline(job.provider_call_id as string);
      await db.from('jobs').update({ status: 'done', last_error: null }).eq('id', job.id);
      processed.push({ id: job.id, outcome: res.outcome });
    } catch (e) {
      const attempts = (job.attempts ?? 0) + 1;
      const max = job.max_attempts ?? 5;
      const dead = attempts >= max;
      // Exponential backoff: next run in 2^attempts minutes.
      const runAfter = new Date(Date.now() + Math.min(2 ** attempts, 30) * 60000).toISOString();
      await db
        .from('jobs')
        .update({
          status: dead ? 'dead' : 'failed',
          attempts,
          last_error: e instanceof Error ? e.message.slice(0, 500) : String(e),
          run_after: runAfter,
        })
        .eq('id', job.id);
      processed.push({ id: job.id, error: e instanceof Error ? e.message : 'error' });
    }
  }

  return NextResponse.json({ ok: true, processed });
}
