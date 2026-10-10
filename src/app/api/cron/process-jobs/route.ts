import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/http/cron-auth';
import { runPostCallPipeline } from '@/lib/pipeline/post-call';
import { emailProvider } from '@/lib/notify/email';
import { env } from '@/lib/env';

export const maxDuration = 60;

async function alertDeadJob(db: SupabaseClient, job: { id: string; provider_call_id?: string }, msg: string) {
  const to = env.nikhilEmail();
  if (!to) return;
  try {
    await emailProvider().send({
      to,
      subject: '🚨 Aangan: a call failed processing (needs attention)',
      text: `Post-call processing failed permanently for call ${job.provider_call_id}.\n\nError: ${msg}\n\nCheck the Guardrails page.`,
      html: `<p>Post-call processing failed permanently for call <code>${job.provider_call_id}</code>.</p><p>Error: ${msg}</p><p>Check the Guardrails page.</p>`,
    });
    await db.from('audit_log').insert({ actor: 'cron', action: 'job_dead_alert', entity: 'jobs', entity_id: job.id, detail: { msg } });
  } catch (e) {
    console.error('[process-jobs] dead-job alert failed:', e);
  }
}

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
      const msg = e instanceof Error ? e.message : String(e);

      // LLM quota/rate-limit: DEFER without burning attempts so no lead is lost on
      // the free tier's daily cap — retry in 1h until the window resets.
      if (/RESOURCE_EXHAUSTED|quota|429|rate limit/i.test(msg)) {
        await db.from('jobs').update({
          status: 'pending',
          last_error: `deferred (quota): ${msg.slice(0, 200)}`,
          run_after: new Date(Date.now() + 60 * 60000).toISOString(),
        }).eq('id', job.id);
        processed.push({ id: job.id, error: 'deferred-quota' });
        continue;
      }

      const attempts = (job.attempts ?? 0) + 1;
      const max = job.max_attempts ?? 5;
      const dead = attempts >= max;
      const runAfter = new Date(Date.now() + Math.min(2 ** attempts, 30) * 60000).toISOString();
      await db.from('jobs').update({
        status: dead ? 'dead' : 'failed',
        attempts,
        last_error: msg.slice(0, 500),
        run_after: runAfter,
      }).eq('id', job.id);

      // Dead-letter → alert the founder so nothing silently fails.
      if (dead) await alertDeadJob(db, job, msg);
      processed.push({ id: job.id, error: msg });
    }
  }

  return NextResponse.json({ ok: true, processed });
}
