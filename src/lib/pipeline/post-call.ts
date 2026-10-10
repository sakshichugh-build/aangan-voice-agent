import { formatInTimeZone } from 'date-fns-tz';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadSettings } from '@/lib/settings/config';
import { extractLead, EXTRACTION_PROMPT_VERSION } from '@/lib/extract/lead';
import { qualify } from '@/lib/qualify/rules';
import { scanTranscriptForPricingLeaks } from '@/lib/guardrails/pricing';
import { llmCostRows, vaaniCostRow } from '@/lib/cost/ledger';
import { selectDesignerForLead } from '@/lib/assign/select';
import { renderHandoff } from '@/lib/notify/handoff-note';
import { renderBookingLink } from '@/lib/notify/confirmation';
import { emailProvider } from '@/lib/notify/email';
import { isAfterHours } from '@/lib/time/office-hours';
import { env } from '@/lib/env';

const IST = 'Asia/Kolkata';

export interface PipelineResult {
  callId: string;
  outcome: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Post-call pipeline P1–P5 + routing (§6). Idempotent: if a qualification already
 * exists for the call, it is a no-op. Call/transcript must already be stored (P1).
 */
export async function runPostCallPipeline(providerCallId: string): Promise<PipelineResult> {
  const db = supabaseAdmin();
  const settings = await loadSettings();

  const { data: call } = await db
    .from('calls')
    .select('*')
    .eq('provider_call_id', providerCallId)
    .maybeSingle();
  if (!call) throw new Error(`call not found for provider_call_id=${providerCallId}`);

  // Idempotency guard
  const { data: existingQ } = await db
    .from('qualifications')
    .select('id,outcome')
    .eq('call_id', call.id)
    .maybeSingle();
  if (existingQ) return { callId: call.id, outcome: existingQ.outcome, skipped: true, reason: 'already processed' };

  const { data: transcript } = await db
    .from('transcripts')
    .select('full_text')
    .eq('call_id', call.id)
    .maybeSingle();
  const fullText = transcript?.full_text ?? '';

  // P1 — after-hours flag (IST)
  const startedAt = call.started_at ? new Date(call.started_at) : new Date();
  const afterHours = isAfterHours(startedAt, settings.officeHours);
  await db.from('calls').update({ after_hours: afterHours }).eq('id', call.id);

  // P2 — extract
  const ex = await extractLead(fullText);
  const { data: extractionRow } = await db
    .from('extractions')
    .insert({
      call_id: call.id,
      lead_id: call.lead_id,
      data: ex.extraction ?? { error: ex.error, raw: ex.rawText.slice(0, 2000) },
      model: ex.model,
      prompt_version: EXTRACTION_PROMPT_VERSION,
      input_tokens: ex.inputTokens,
      output_tokens: ex.outputTokens,
      valid: ex.valid,
      attempts: ex.attempts,
    })
    .select('id')
    .single();

  // P5 (partial) — LLM cost rows always written
  await writeCosts(db, call.id, ex.inputTokens, ex.outputTokens, ex.model, call.duration_sec);

  if (!ex.valid || !ex.extraction) {
    await db.from('qualifications').insert({
      call_id: call.id, lead_id: call.lead_id, extraction_id: extractionRow?.id,
      outcome: 'NEEDS_REVIEW', decline_reason: 'extraction_failed', flags: [],
      rule_trace: [{ criterion: 'extraction', status: 'fail', detail: ex.error ?? 'invalid JSON' }],
      rules_version: 'n/a',
    });
    await db.from('guardrail_events').insert({
      call_id: call.id, lead_id: call.lead_id, type: 'extraction_failed', severity: 'high',
      detail: ex.error ?? 'extraction invalid after retry', method: 'system',
    });
    await db.from('tasks').insert({
      type: 'front_desk', call_id: call.id, lead_id: call.lead_id, assigned_role: 'front_desk',
      title: 'Review call — extraction failed', notes: 'Automatic extraction failed; please classify manually.',
    });
    await audit(db, 'pipeline', 'needs_review', 'call', call.id, { reason: 'extraction_failed' });
    return { callId: call.id, outcome: 'NEEDS_REVIEW' };
  }

  // Update lead with discovered name/phone/language
  if (call.lead_id) {
    const patch: Record<string, unknown> = { last_contact_at: new Date().toISOString() };
    if (ex.extraction.caller_name) patch.name = ex.extraction.caller_name;
    await db.from('leads').update(patch).eq('id', call.lead_id);
  }

  // P3 — rules
  const q = qualify(ex.extraction, settings.rules);
  const { data: qRow } = await db
    .from('qualifications')
    .insert({
      call_id: call.id, lead_id: call.lead_id, extraction_id: extractionRow?.id,
      outcome: q.outcome, decline_reason: q.decline_reason, flags: q.flags,
      rule_trace: q.rule_trace, rules_version: q.rules_version,
    })
    .select('id')
    .single();

  // P4 — pricing guardrail (regex; LLM second-check optional to conserve quota)
  const leaks = scanTranscriptForPricingLeaks(fullText);
  for (const leak of leaks) {
    await db.from('guardrail_events').insert({
      call_id: call.id, lead_id: call.lead_id, type: 'pricing_leak', severity: 'high',
      detail: leak.reason, evidence: `${leak.match} — "${leak.snippet}"`, method: 'regex',
    });
  }
  if (leaks.length && env.nikhilEmail()) {
    await safeEmail({
      to: env.nikhilEmail(),
      subject: `⚠️ Possible pricing leak on call ${call.id.slice(0, 8)}`,
      text: `The agent may have stated a price. Matches: ${leaks.map((l) => l.match).join(', ')}`,
      html: `<p>The agent may have stated a price on a call.</p><p>Matches: ${leaks.map((l) => l.match).join(', ')}</p>`,
    });
  }

  // Route by outcome
  await route(db, settings, call, ex.extraction, q, qRow?.id ?? null, afterHours);
  await audit(db, 'pipeline', 'processed', 'call', call.id, { outcome: q.outcome, flags: q.flags });
  return { callId: call.id, outcome: q.outcome };
}

type Q = ReturnType<typeof qualify>;
type Ex = NonNullable<Awaited<ReturnType<typeof extractLead>>['extraction']>;

async function route(
  db: ReturnType<typeof supabaseAdmin>,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  call: Record<string, unknown> & { id: string; lead_id: string | null; started_at: string | null; duration_sec: number | null },
  ex: Ex,
  q: Q,
  qualificationId: string | null,
  afterHours: boolean,
) {
  const now = new Date();

  if (q.outcome === 'QUALIFIED' || q.outcome === 'QUALIFIED_FLAGGED') {
    const sel = await selectDesignerForLead(db, q.flags, settings.maxOpenLeadsDefault);
    const recipients: string[] = [];
    if (sel.designer?.email) recipients.push(sel.designer.email);
    const cc: string[] = [];
    if (sel.copyNikhil && env.nikhilEmail()) cc.push(env.nikhilEmail());

    const { data: handoff } = await db
      .from('handoffs')
      .insert({
        lead_id: call.lead_id, call_id: call.id, qualification_id: qualificationId,
        designer_id: sel.designer?.id ?? null, delivery_channel: 'email',
        recipient: sel.designer?.email ?? null, copied_to: cc.length ? cc : null,
      })
      .select('id,action_token')
      .single();

    // Site visit for large / new-possession / bare-shell homes (§5.6); else studio.
    const siteVisit =
      q.flags.includes('LARGE_PROJECT') ||
      /possession|bare shell|new construction|empty|under construction/i.test(ex.current_state ?? '');
    const booking = ex.consultation_booked
      ? { whenLabel: ex.preferred_slots?.[0] ?? 'confirmed on call', type: (siteVisit ? 'site_visit' : 'studio') as 'studio' | 'site_visit', designerName: sel.designer?.name }
      : null;

    const note = renderHandoff({
      outcome: q.outcome, flags: q.flags, ex,
      calledAtLabel: calledLabel(call.started_at, afterHours),
      answeredInLabel: '0s',
      durationLabel: durationLabel(call.duration_sec),
      booking, appBaseUrl: env.appBaseUrl(), actionToken: handoff?.action_token ?? '',
    });

    if (recipients.length) {
      const sent = await safeEmail({ to: recipients, cc: cc.length ? cc : undefined, subject: note.subject, text: note.text, html: note.html });
      await db.from('handoffs').update({ sent_at: now.toISOString(), provider_message_id: sent?.id ?? null }).eq('id', handoff?.id);
    }

    // Email the caller the Calendly booking link (they pick a time; Calendly sends
    // the confirmation + calendar invite). Needs their email + a configured link.
    if (ex.caller_email && settings.calendlyUrl) {
      if (call.lead_id) await db.from('leads').update({ email: ex.caller_email }).eq('id', call.lead_id);
      const link = renderBookingLink(ex.caller_name, settings.calendlyUrl);
      await safeEmail({ to: ex.caller_email, subject: link.subject, text: link.text, html: link.html });
    }
    return;
  }

  if (q.outcome === 'NURTURE') {
    await db.from('tasks').insert({
      type: 'nurture', call_id: call.id, lead_id: call.lead_id, assigned_role: 'front_desk',
      title: `Nurture: re-contact ${ex.caller_name ?? 'caller'}`,
      notes: q.rule_trace.find((t) => t.criterion === '3_timeline')?.detail ?? 'Timeline not yet viable.',
      due_date: q.follow_up_date ? q.follow_up_date.slice(0, 10) : null,
    });
    return;
  }

  if (q.outcome === 'ESCALATION') {
    const promisedBy = new Date(now.getTime() + settings.escalationCallbackMinutes * 60000).toISOString();
    await db.from('escalations').insert({
      lead_id: call.lead_id, call_id: call.id, reason: q.decline_reason ?? 'existing_client_complaint',
      promised_callback_by: promisedBy,
    });
    const to = [env.nikhilEmail(), env.seniorEmail()].filter(Boolean) as string[];
    if (to.length) {
      await safeEmail({
        to,
        subject: `🚨 ESCALATION — senior callback promised within ${settings.escalationCallbackMinutes} min`,
        text: `${ex.caller_name ?? 'A caller'} (${ex.phone ?? 'no number'}) needs a senior callback by ${promisedBy}.\n\n${ex.summary_for_designer}`,
        html: `<p><strong>Escalation.</strong> ${ex.caller_name ?? 'A caller'} (${ex.phone ?? 'no number'}) needs a senior callback within ${settings.escalationCallbackMinutes} minutes.</p><p>${ex.summary_for_designer}</p>`,
      });
    }
    return;
  }

  if (q.outcome === 'CALLBACK_NEEDED') {
    await db.from('callbacks').insert({
      lead_id: call.lead_id, call_id: call.id, reason: 'dropped',
      scheduled_for: nextCallbackSlot(now, settings).toISOString(),
    });
    return;
  }

  if (q.outcome === 'NEEDS_REVIEW') {
    await db.from('tasks').insert({
      type: 'front_desk', call_id: call.id, lead_id: call.lead_id, assigned_role: 'front_desk',
      title: 'Review call — needs manual classification', notes: 'Rules could not decide confidently.',
    });
  }
  // DECLINED / NOT_A_LEAD → logged via qualification only.
}

async function writeCosts(
  db: ReturnType<typeof supabaseAdmin>,
  callId: string,
  inTok: number,
  outTok: number,
  model: string,
  durationSec: number | null,
) {
  const rows = llmCostRows(inTok, outTok, model);
  if (durationSec && durationSec > 0) rows.push(vaaniCostRow(durationSec / 60));
  if (rows.length) {
    await db.from('cost_ledger').insert(
      rows.map((r) => ({
        call_id: callId, source: r.source, units: r.units, unit_label: r.unit_label,
        unit_cost_inr: r.unit_cost_inr, amount_inr: r.amount_inr, meta: r.meta ?? null,
      })),
    );
  }
}

async function safeEmail(msg: Parameters<ReturnType<typeof emailProvider>['send']>[0]) {
  try {
    return await emailProvider().send(msg);
  } catch (e) {
    console.error('[pipeline] email failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function audit(
  db: ReturnType<typeof supabaseAdmin>,
  actor: string, action: string, entity: string, entityId: string, detail: unknown,
) {
  await db.from('audit_log').insert({ actor, action, entity, entity_id: entityId, detail });
}

function calledLabel(startedAt: string | null, afterHours: boolean): string {
  if (!startedAt) return 'unknown time';
  const t = formatInTimeZone(new Date(startedAt), IST, 'd MMM, h:mmaaa');
  return `${t}${afterHours ? ' (after hours)' : ''}`;
}

function durationLabel(sec: number | null): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

/** Next callback slot: now if within window, else the window's opening time. */
function nextCallbackSlot(now: Date, settings: Awaited<ReturnType<typeof loadSettings>>): Date {
  const tz = settings.callbackWindow.tz || IST;
  const hhmmNow = formatInTimeZone(now, tz, 'HH:mm');
  if (hhmmNow >= settings.callbackWindow.start && hhmmNow < settings.callbackWindow.end) return now;
  // Schedule for the window start (today if before open, else tomorrow).
  const dayOffset = hhmmNow >= settings.callbackWindow.end ? 1 : 0;
  const base = new Date(now.getTime() + dayOffset * 86400000);
  const dateStr = formatInTimeZone(base, tz, 'yyyy-MM-dd');
  // Interpret window start as IST wall-clock.
  return new Date(`${dateStr}T${settings.afterHoursCallbackAt}:00+05:30`);
}
