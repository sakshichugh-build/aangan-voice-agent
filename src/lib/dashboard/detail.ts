import { supabaseAdmin } from '@/lib/supabase/admin';

/** Inbox row: one per call with its outcome/flags and lead info. */
export interface InboxRow {
  callId: string;
  startedAt: string | null;
  afterHours: boolean;
  durationSec: number | null;
  status: string;
  leadName: string | null;
  phone: string | null;
  outcome: string | null;
  flags: string[];
  hasTranscript: boolean;
  hasRecording: boolean;
}

export async function getInbox(limit = 100): Promise<InboxRow[]> {
  const db = supabaseAdmin();
  const { data: calls } = await db
    .from('calls')
    .select('id,started_at,after_hours,duration_sec,status,recording_url,lead_id')
    .order('started_at', { ascending: false })
    .limit(limit);
  const callRows = calls ?? [];
  if (!callRows.length) return [];

  const callIds = callRows.map((c) => c.id);
  const leadIds = [...new Set(callRows.map((c) => c.lead_id).filter(Boolean))] as string[];

  const [{ data: quals }, { data: leads }, { data: transcripts }] = await Promise.all([
    db.from('qualifications').select('call_id,outcome,flags').in('call_id', callIds),
    leadIds.length ? db.from('leads').select('id,name,phone').in('id', leadIds) : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string | null }[] }),
    db.from('transcripts').select('call_id').in('call_id', callIds),
  ]);

  const qMap = new Map((quals ?? []).map((q) => [q.call_id, q]));
  const lMap = new Map((leads ?? []).map((l) => [l.id, l]));
  const tSet = new Set((transcripts ?? []).map((t) => t.call_id));

  return callRows.map((c) => {
    const q = qMap.get(c.id);
    const l = c.lead_id ? lMap.get(c.lead_id) : null;
    return {
      callId: c.id,
      startedAt: c.started_at,
      afterHours: c.after_hours,
      durationSec: c.duration_sec,
      status: c.status,
      leadName: l?.name ?? null,
      phone: l?.phone ?? null,
      outcome: q?.outcome ?? null,
      flags: (q?.flags as string[]) ?? [],
      hasTranscript: tSet.has(c.id),
      hasRecording: !!c.recording_url,
    };
  });
}

export interface LeadDetail {
  call: Record<string, unknown> | null;
  lead: Record<string, unknown> | null;
  transcript: string | null;
  extraction: Record<string, unknown> | null;
  evidence: Record<string, string>;
  qualification: { outcome: string; flags: string[]; decline_reason: string | null; rule_trace: RuleTraceEntry[] } | null;
  handoffs: HandoffRow[];
  guardrails: { type: string; detail: string | null; evidence: string | null; created_at: string }[];
}

interface RuleTraceEntry { criterion: string; status: string; detail: string }
interface HandoffRow {
  designer: string | null;
  sent_at: string | null;
  claimed_at: string | null;
  called_at: string | null;
  outcome: string | null;
  reping_count: number;
  escalated_at: string | null;
}

export async function getLeadDetail(callId: string): Promise<LeadDetail> {
  const db = supabaseAdmin();
  const { data: call } = await db.from('calls').select('*').eq('id', callId).maybeSingle();
  if (!call) return { call: null, lead: null, transcript: null, extraction: null, evidence: {}, qualification: null, handoffs: [], guardrails: [] };

  const [{ data: lead }, { data: transcript }, { data: extraction }, { data: qual }, { data: handoffs }, { data: designers }, { data: guardrails }] =
    await Promise.all([
      call.lead_id ? db.from('leads').select('*').eq('id', call.lead_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from('transcripts').select('full_text').eq('call_id', callId).maybeSingle(),
      db.from('extractions').select('data').eq('call_id', callId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('qualifications').select('outcome,flags,decline_reason,rule_trace').eq('call_id', callId).maybeSingle(),
      db.from('handoffs').select('designer_id,sent_at,claimed_at,called_at,outcome,reping_count,escalated_at').eq('call_id', callId),
      db.from('designers').select('id,name'),
      db.from('guardrail_events').select('type,detail,evidence,created_at').eq('call_id', callId),
    ]);

  const dName = new Map((designers ?? []).map((d) => [d.id, d.name]));
  const exData = (extraction?.data as Record<string, unknown>) ?? null;
  const evidence = (exData?.evidence as Record<string, string>) ?? {};

  return {
    call,
    lead: lead ?? null,
    transcript: transcript?.full_text ?? null,
    extraction: exData,
    evidence,
    qualification: qual
      ? { outcome: qual.outcome, flags: (qual.flags as string[]) ?? [], decline_reason: qual.decline_reason, rule_trace: (qual.rule_trace as RuleTraceEntry[]) ?? [] }
      : null,
    handoffs: (handoffs ?? []).map((h) => ({
      designer: h.designer_id ? dName.get(h.designer_id) ?? null : null,
      sent_at: h.sent_at, claimed_at: h.claimed_at, called_at: h.called_at,
      outcome: h.outcome, reping_count: h.reping_count ?? 0, escalated_at: h.escalated_at,
    })),
    guardrails: (guardrails ?? []).map((g) => ({ type: g.type, detail: g.detail, evidence: g.evidence, created_at: g.created_at })),
  };
}

export interface GuardrailsView {
  pricingLeaks: { callId: string; detail: string | null; evidence: string | null; created_at: string; resolved: boolean }[];
  failedExtractions: { callId: string; detail: string | null; created_at: string; resolved: boolean }[];
  unclaimedLeads: { callId: string; sent_at: string | null; designer: string | null; repingCount: number; escalated: boolean }[];
  missedCallbacks: { callId: string; promised_callback_by: string | null; created_at: string }[];
}

export async function getGuardrails(): Promise<GuardrailsView> {
  const db = supabaseAdmin();
  const [{ data: events }, { data: handoffs }, { data: designers }, { data: escalations }] = await Promise.all([
    db.from('guardrail_events').select('call_id,type,detail,evidence,created_at,resolved').order('created_at', { ascending: false }).limit(200),
    db.from('handoffs').select('call_id,sent_at,designer_id,reping_count,escalated_at,claimed_at,outcome').not('sent_at', 'is', null).is('claimed_at', null).is('outcome', null),
    db.from('designers').select('id,name'),
    db.from('escalations').select('call_id,promised_callback_by,created_at,callback_happened,resolved_at').eq('callback_happened', false).is('resolved_at', null).lt('promised_callback_by', new Date().toISOString()),
  ]);

  const dName = new Map((designers ?? []).map((d) => [d.id, d.name]));
  const ev = events ?? [];

  return {
    pricingLeaks: ev.filter((e) => e.type === 'pricing_leak').map((e) => ({ callId: e.call_id, detail: e.detail, evidence: e.evidence, created_at: e.created_at, resolved: e.resolved })),
    failedExtractions: ev.filter((e) => e.type === 'extraction_failed').map((e) => ({ callId: e.call_id, detail: e.detail, created_at: e.created_at, resolved: e.resolved })),
    unclaimedLeads: (handoffs ?? []).map((h) => ({ callId: h.call_id, sent_at: h.sent_at, designer: h.designer_id ? dName.get(h.designer_id) ?? null : null, repingCount: h.reping_count ?? 0, escalated: !!h.escalated_at })),
    missedCallbacks: (escalations ?? []).map((e) => ({ callId: e.call_id, promised_callback_by: e.promised_callback_by, created_at: e.created_at })),
  };
}

export interface SettingsData {
  settings: { key: string; value: unknown }[];
  designers: { id: string; name: string; email: string | null; is_principal: boolean; active: boolean; max_open_leads: number }[];
  serviceAreas: { name: string; region: string; in_service: boolean }[];
  rates: { key: string; value: number; currency: string | null; note: string | null }[];
}

export async function getSettingsData(): Promise<SettingsData> {
  const db = supabaseAdmin();
  const [{ data: settings }, { data: designers }, { data: serviceAreas }, { data: rates }] = await Promise.all([
    db.from('settings').select('key,value').order('key'),
    db.from('designers').select('id,name,email,is_principal,active,max_open_leads').order('name'),
    db.from('service_areas').select('name,region,in_service').order('region').order('name'),
    db.from('rates').select('key,value,currency,note').order('key'),
  ]);
  return {
    settings: (settings ?? []).map((s) => ({ key: s.key, value: s.value })),
    designers: (designers ?? []) as SettingsData['designers'],
    serviceAreas: (serviceAreas ?? []) as SettingsData['serviceAreas'],
    rates: (rates ?? []).map((r) => ({ key: r.key, value: Number(r.value), currency: r.currency, note: r.note })),
  };
}
