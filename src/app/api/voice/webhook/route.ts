import { NextResponse } from 'next/server';
import { ingestCall } from '@/lib/pipeline/ingest';
import { env } from '@/lib/env';

export const maxDuration = 30;

/**
 * Inbound voice webhook. Phase 4 plugs in the Vaani VoiceProvider
 * (signature verification + payload normalisation). For now it accepts a
 * normalised event shape, verifies the shared secret, and stores the call (P1)
 * which enqueues the post-call pipeline. Idempotent on provider_call_id.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  // Shared-secret check (Vaani signature verification added in Phase 4).
  const secret = req.headers.get('x-webhook-secret') ?? req.headers.get('x-cron-secret');
  const expected = env.vaaniWebhookSecret() || env.cronSecret();
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const type = String(body.type ?? body.event ?? '');
  const providerCallId = String(body.providerCallId ?? body.call_id ?? body.callId ?? '');
  if (!providerCallId) return NextResponse.json({ error: 'missing call id' }, { status: 400 });

  // call.started → create an in_progress call (no job yet). call.ended → full ingest + enqueue.
  const ended = type.includes('ended') || type.includes('completed') || body.status === 'completed';
  const res = await ingestCall({
    providerCallId,
    provider: String(body.provider ?? 'vaani'),
    direction: (body.direction as 'inbound' | 'outbound') ?? 'inbound',
    phone: (body.from ?? body.from_number ?? body.phone) as string | null,
    toNumber: (body.to ?? body.to_number) as string | null,
    startedAt: (body.started_at ?? body.startedAt) as string | null,
    endedAt: (body.ended_at ?? body.endedAt) as string | null,
    durationSec: (body.duration_sec ?? body.durationSec) as number | null,
    recordingUrl: (body.recording_url ?? body.recordingUrl) as string | null,
    language: (body.language as string) ?? null,
    status: (body.status as 'completed' | 'missed' | 'dropped' | 'failed') ?? (ended ? 'completed' : 'in_progress'),
    transcript: (body.transcript as string) ?? null,
    raw: body,
    enqueue: ended,
  });

  return NextResponse.json({ ok: true, callId: res.callId, created: res.created });
}
