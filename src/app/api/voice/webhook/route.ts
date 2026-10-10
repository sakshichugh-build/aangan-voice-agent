import { NextResponse } from 'next/server';
import { ingestCall } from '@/lib/pipeline/ingest';
import { env } from '@/lib/env';

export const maxDuration = 30;

/**
 * Vaani call-event webhook (§6 P1). Vaani fires (per docs.vaanivoice.ai):
 *   - call_started            : call begins
 *   - call_ended              : session ends (duration, end_reason)
 *   - call_postprocessing     : transcript + recording ready  ← triggers the pipeline
 *
 * Vaani's webhook has no documented signature header, so we authenticate with a
 * shared secret in the URL query (`?s=…`) or the x-vaani-secret header.
 * Idempotent on the Vaani call id across the multi-event sequence.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret =
    url.searchParams.get('s') ??
    req.headers.get('x-vaani-secret') ??
    req.headers.get('x-webhook-secret');
  const expected = env.vaaniWebhookSecret() || env.cronSecret();
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const event = String(body.event ?? body.type ?? '');
  const data = (body.data as Record<string, unknown>) ?? {};
  const providerCallId = String(
    body.call_id ?? data.call_id ?? body.room_name ?? body.callId ?? '',
  );
  if (!providerCallId) return NextResponse.json({ ok: true, ignored: 'no call id' });

  const phone = (data.from_number ?? data.caller ?? body.from_number ?? body.from ?? null) as string | null;
  const language = (data.language ?? body.language ?? null) as string | null;

  if (event === 'call_postprocessing') {
    // Transcript + recording ready → store and run the pipeline.
    const durMs = Number(data.call_duration ?? 0);
    await ingestCall({
      providerCallId,
      provider: 'vaani',
      phone,
      language,
      durationSec: durMs ? Math.round(durMs / 1000) : null,
      recordingUrl: (data.recording_url as string) ?? null,
      transcript: (data.transcript as string) ?? null,
      status: 'completed',
      endedAt: new Date().toISOString(),
      raw: body,
      enqueue: true,
    });
    return NextResponse.json({ ok: true, processed: 'postprocessing' });
  }

  if (event === 'call_ended') {
    // Short/empty call with no content → treat as dropped and queue a callback.
    const durationSec = Number(body.call_duration ?? data.call_duration ?? 0);
    if (durationSec > 0 && durationSec < 20) {
      await ingestCall({
        providerCallId, provider: 'vaani', phone, language,
        durationSec: Math.round(durationSec), status: 'dropped',
        endedAt: new Date().toISOString(), raw: body, enqueue: true,
      });
      return NextResponse.json({ ok: true, processed: 'dropped' });
    }
    // Otherwise wait for call_postprocessing (which carries the transcript).
    return NextResponse.json({ ok: true, noted: 'call_ended' });
  }

  if (event === 'call_started') {
    await ingestCall({
      providerCallId, provider: 'vaani', phone, language,
      startedAt: new Date().toISOString(), status: 'in_progress', raw: body, enqueue: false,
    });
    return NextResponse.json({ ok: true, noted: 'call_started' });
  }

  return NextResponse.json({ ok: true, ignored: event });
}
