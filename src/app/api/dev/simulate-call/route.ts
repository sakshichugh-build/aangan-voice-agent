import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/http/cron-auth';
import { ingestCall } from '@/lib/pipeline/ingest';
import { runPostCallPipeline } from '@/lib/pipeline/post-call';

export const maxDuration = 60;

/**
 * Dev-only: simulate an inbound call from a transcript so the whole pipeline,
 * handoff, and dashboard can be exercised before Vaani is connected (used to seed
 * dashboard data from the eval transcripts). Guarded by the cron secret.
 *
 * Body: { providerCallId?, phone?, transcript, status?, durationSec?, startedAt?, runInline? }
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.transcript) return NextResponse.json({ error: 'transcript required' }, { status: 400 });

  const providerCallId = body.providerCallId ?? `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const status = body.status ?? 'completed';

  const ingest = await ingestCall({
    providerCallId,
    provider: 'simulate',
    phone: body.phone ?? null,
    startedAt: body.startedAt ?? new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSec: body.durationSec ?? 240,
    language: body.language ?? null,
    status,
    transcript: body.transcript,
    enqueue: status === 'completed',
  });

  let outcome: string | undefined;
  if (body.runInline && status === 'completed') {
    const res = await runPostCallPipeline(providerCallId);
    outcome = res.outcome;
  }

  return NextResponse.json({ ok: true, callId: ingest.callId, providerCallId, outcome });
}
