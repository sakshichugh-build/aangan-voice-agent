import { supabaseAdmin } from '@/lib/supabase/admin';

export interface IngestInput {
  providerCallId: string;
  provider?: string;
  direction?: 'inbound' | 'outbound';
  phone?: string | null; // caller number
  toNumber?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  answeredAt?: string | null;
  durationSec?: number | null;
  recordingUrl?: string | null;
  language?: string | null;
  status?: 'in_progress' | 'completed' | 'missed' | 'dropped' | 'failed';
  transcript?: string | null;
  raw?: unknown;
  enqueue?: boolean; // enqueue post-call job (default true for ended calls)
}

export interface IngestResult {
  callId: string;
  leadId: string | null;
  created: boolean; // false if the call already existed (idempotent)
}

/** Normalise an Indian phone number to E.164 (+91…) best-effort. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  const only = digits.replace(/\D/g, '');
  if (only.length === 10) return `+91${only}`;
  if (only.length === 12 && only.startsWith('91')) return `+${only}`;
  return only ? `+${only}` : null;
}

/**
 * Store a call (P1): upsert the lead by phone, insert the call idempotently on
 * provider_call_id, store the transcript, and enqueue the post-call job.
 * Safe to call twice for the same provider_call_id (dedup) — no double leads/jobs.
 */
export async function ingestCall(input: IngestInput): Promise<IngestResult> {
  const db = supabaseAdmin();
  const provider = input.provider ?? 'vaani';
  const phone = normalizePhone(input.phone);

  // Idempotency: existing call? If so, enrich it (multi-event sequences like
  // call.started → call.ended → call_postprocessing) without duplicating.
  const { data: existing } = await db
    .from('calls')
    .select('id,lead_id')
    .eq('provider', provider)
    .eq('provider_call_id', input.providerCallId)
    .maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (input.endedAt) patch.ended_at = input.endedAt;
    if (input.durationSec != null) patch.duration_sec = input.durationSec;
    if (input.recordingUrl) patch.recording_url = input.recordingUrl;
    if (input.language) patch.language = input.language;
    if (input.status) patch.status = input.status;
    if (Object.keys(patch).length) await db.from('calls').update(patch).eq('id', existing.id);

    // Attach transcript if newly provided and none stored yet.
    if (input.transcript) {
      const { data: t } = await db.from('transcripts').select('id').eq('call_id', existing.id).maybeSingle();
      if (!t) await db.from('transcripts').insert({ call_id: existing.id, full_text: input.transcript, source: provider === 'simulate' ? 'seed' : 'vaani' });
    }
    // Enqueue if requested and not already queued.
    if (input.enqueue) {
      await db.from('jobs').upsert(
        { type: 'post_call_pipeline', call_id: existing.id, provider_call_id: input.providerCallId, status: 'pending', run_after: new Date().toISOString() },
        { onConflict: 'type,provider_call_id', ignoreDuplicates: true },
      );
    }
    return { callId: existing.id, leadId: existing.lead_id, created: false };
  }

  // Upsert lead by (channel, phone)
  let leadId: string | null = null;
  if (phone) {
    const { data: lead } = await db
      .from('leads')
      .upsert({ channel: 'phone', phone, last_contact_at: new Date().toISOString() }, { onConflict: 'channel,phone' })
      .select('id')
      .single();
    leadId = lead?.id ?? null;
  } else {
    const { data: lead } = await db.from('leads').insert({ channel: 'phone' }).select('id').single();
    leadId = lead?.id ?? null;
  }

  // Insert call
  const { data: call } = await db
    .from('calls')
    .insert({
      lead_id: leadId,
      provider,
      provider_call_id: input.providerCallId,
      direction: input.direction ?? 'inbound',
      from_number: phone,
      to_number: input.toNumber ?? null,
      started_at: input.startedAt ?? new Date().toISOString(),
      ended_at: input.endedAt ?? null,
      answered_at: input.answeredAt ?? null,
      duration_sec: input.durationSec ?? null,
      recording_url: input.recordingUrl ?? null,
      language: input.language ?? null,
      status: input.status ?? 'completed',
      raw_payload: input.raw ?? null,
    })
    .select('id')
    .single();

  if (!call) throw new Error('failed to insert call');

  // Transcript
  if (input.transcript) {
    await db.from('transcripts').insert({ call_id: call.id, full_text: input.transcript, source: provider === 'simulate' ? 'seed' : 'vaani' });
  }

  // Enqueue post-call job (idempotent on type+provider_call_id)
  const shouldEnqueue = input.enqueue ?? (input.status ?? 'completed') === 'completed';
  if (shouldEnqueue) {
    await db.from('jobs').upsert(
      { type: 'post_call_pipeline', call_id: call.id, provider_call_id: input.providerCallId, status: 'pending', run_after: new Date().toISOString() },
      { onConflict: 'type,provider_call_id' },
    );
  }

  return { callId: call.id, leadId, created: true };
}
