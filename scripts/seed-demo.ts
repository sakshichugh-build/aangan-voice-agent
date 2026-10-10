/**
 * Seeds realistic DEMO data so the dashboard is populated before Vaani/live LLM.
 * Runs the REAL rules engine + cost ledger on hand-built extractions derived from
 * the actual seed transcripts — only the extraction step is hand-specified (the
 * LLM path is proven by the eval). Everything is tagged provider='demo' and can be
 * removed with:  delete from calls where provider='demo';  (cascades).
 *
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… npm run seed:demo
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { qualify } from '@/lib/qualify/rules';
import { llmCostRows, vaaniCostRow } from '@/lib/cost/ledger';
import type { Extraction } from '@/lib/qualify/schema';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) { console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF'); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function sql<T = unknown>(query: string): Promise<T[]> {
  const res = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
const q = (s: unknown) => `'${String(s).replace(/'/g, "''")}'`;
const qj = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

function base(o: Partial<Extraction>): Extraction {
  return {
    intent: 'new_project', caller_name: null, caller_email: null, phone: null, language: 'English',
    project_type: 'residential_full', locality: null, city: 'Pune', in_service_area: 'yes',
    carpet_area_sqft: 1200, rooms_scope: ['kitchen', 'living', 'bedrooms'], current_state: 'lived-in', is_rented: false,
    wants_execution: 'yes', timeline_text: 'flexible', target_completion_date: null, weeks_available: null,
    budget_volunteered: false, budget_inr_min: null, budget_inr_max: null, decision_maker: 'yes',
    referral_source: null, referral_name: null, preferred_slots: [], consultation_booked: false, booked_slot_id: null,
    sentiment: 'positive', asked_about_pricing: false, is_repeat_caller: false,
    summary_for_designer: '', open_questions_for_designer: [], evidence: {}, ...o,
  };
}

interface Demo { id: string; phone: string; dur: number; afterHours: boolean; daysAgo: number; ex: Extraction }

const DEMOS: Demo[] = [
  { id: 'T01', phone: '+919800000012', dur: 252, afterHours: true, daysAgo: 1, ex: base({ caller_name: 'Priya S.', phone: '+919800000012', locality: 'Kothrud', carpet_area_sqft: 1400, referral_source: 'past client', referral_name: 'Shruti Joshi', consultation_booked: true, preferred_slots: ['Tue 14 Oct, 11:00'], summary_for_designer: '3BHK full redesign in Kothrud, ~1,400 sqft. Lived-in builder finish. Flexible timeline (by March). Owner + husband authorised.' }) },
  { id: 'T05', phone: '+919800000055', dur: 404, afterHours: false, daysAgo: 2, ex: base({ caller_name: 'Aarti Mehta', phone: '+919800000055', locality: 'Koregaon Park', carpet_area_sqft: 2400, rooms_scope: ['flooring', 'kitchen', 'b1', 'b2', 'b3', 'b4'], current_state: 'moved out, empty', referral_source: 'close friend of Nikhil', referral_name: 'Vikram Agarwal', consultation_booked: true, preferred_slots: ['site visit — early next week'], summary_for_designer: '4BHK complete redesign, Koregaon Park, ~2,400 sqft. VIP referral (Nikhil). Move back by February. Wants site visit.' }) },
  { id: 'T13', phone: '+919800000013', dur: 368, afterHours: false, daysAgo: 3, ex: base({ caller_name: 'Caller (Aundh)', phone: '+919800000013', project_type: 'residential_partial', locality: 'Aundh', carpet_area_sqft: 1100, rooms_scope: ['kitchen', 'wardrobes', 'living'], asked_about_pricing: true, consultation_booked: true, preferred_slots: ['weekday'], summary_for_designer: '3BHK partial (kitchen, wardrobes, living) in Aundh, ~1,100 sqft. Asked about pricing twice — deflected. Booked.' }) },
  { id: 'T07', phone: '+919800000007', dur: 195, afterHours: false, daysAgo: 4, ex: base({ caller_name: 'Caller (Diwali)', phone: '+919800000007', project_type: 'residential_partial', in_service_area: 'unclear', rooms_scope: ['living', 'kitchen'], weeks_available: 3, target_completion_date: '2026-10-29', timeline_text: 'before Diwali (~3 weeks)', summary_for_designer: 'Living + kitchen, wants done before Diwali (~3 weeks) — too tight. A November start would work. Nurture.' }) },
  { id: 'T10', phone: '+919800000010', dur: 220, afterHours: false, daysAgo: 5, ex: base({ caller_name: 'Caller (Kharadi)', phone: '+919800000010', project_type: 'residential_partial', locality: 'Kharadi', carpet_area_sqft: 550, rooms_scope: ['kitchen', 'bedroom'], budget_volunteered: true, budget_inr_min: 100000, budget_inr_max: 150000, summary_for_designer: '1BHK kitchen + bedroom, Kharadi. Volunteered budget ₹1–1.5L — clearly below scope. Declined kindly.' }) },
  { id: 'T09', phone: '+919800000009', dur: 352, afterHours: false, daysAgo: 6, ex: base({ intent: 'existing_client', caller_name: 'Sheetal Deshpande', phone: '+919800000009', sentiment: 'angry', summary_for_designer: 'EXISTING client complaint — designer unresponsive 5 days. Wants senior callback within 15 min.' }) },
  { id: 'T08', phone: '+919800000008', dur: 0, afterHours: true, daysAgo: 6, ex: base({ intent: 'dropped', phone: '+919800000008', summary_for_designer: 'Missed call, no voicemail (Nanded City area). Auto-callback queued.' }) },
  { id: 'T20', phone: '+919800000020', dur: 284, afterHours: false, daysAgo: 7, ex: base({ caller_name: 'Pooja', phone: '+919800000020', locality: 'Magarpatta', carpet_area_sqft: 900, consultation_booked: true, preferred_slots: ['January start'], summary_for_designer: '2BHK full, Magarpatta ~900 sqft. January start. Both owners attend. Clean qualified.' }) },
];

async function main() {
  console.log('clearing previous demo data…');
  await sql(`delete from calls where provider='demo'`);

  const designers = await sql<{ id: string; name: string; email: string | null; is_principal: boolean }>(`select id,name,email,is_principal from designers where active order by is_principal desc, name limit 5`);
  const model = 'gemini-3.8-flash';
  let rr = 0;

  for (const d of DEMOS) {
    const txtPath = join(process.cwd(), 'seed', 'eval', `${d.id}.txt`);
    const transcript = existsSync(txtPath) ? readFileSync(txtPath, 'utf8') : d.ex.summary_for_designer;
    const started = new Date(Date.now() - d.daysAgo * 86400000).toISOString();
    const status = d.ex.intent === 'dropped' ? 'missed' : 'completed';

    // lead (select-then-insert; partial unique index can't be used with ON CONFLICT)
    let lead = (await sql<{ id: string }>(`select id from leads where channel='phone' and phone=${q(d.phone)} limit 1`))[0];
    if (!lead) {
      lead = (await sql<{ id: string }>(`insert into leads (channel, phone, name, last_contact_at) values ('phone', ${q(d.phone)}, ${q(d.ex.caller_name ?? 'Unknown')}, now()) returning id`))[0];
    } else {
      await sql(`update leads set name=${q(d.ex.caller_name ?? 'Unknown')}, last_contact_at=now() where id=${q(lead.id)}`);
    }
    // call
    const [call] = await sql<{ id: string }>(`insert into calls (lead_id, provider, provider_call_id, direction, from_number, started_at, answered_at, ended_at, duration_sec, after_hours, status, language) values (${q(lead.id)}, 'demo', ${q('demo_' + d.id)}, 'inbound', ${q(d.phone)}, ${q(started)}, ${q(started)}, ${q(started)}, ${d.dur}, ${d.afterHours}, ${q(status)}, ${q(d.ex.language)}) returning id`);
    await sql(`insert into transcripts (call_id, full_text, source) values (${q(call.id)}, ${q(transcript)}, 'seed')`);

    // extraction + cost
    const inTok = 2000, outTok = 440;
    const [ext] = await sql<{ id: string }>(`insert into extractions (call_id, lead_id, data, model, prompt_version, input_tokens, output_tokens, valid, attempts) values (${q(call.id)}, ${q(lead.id)}, ${qj(d.ex)}, ${q(model)}, 'demo', ${inTok}, ${outTok}, true, 1) returning id`);
    const costRows = [...llmCostRows(inTok, outTok, model)];
    if (d.dur > 0) costRows.push(vaaniCostRow(d.dur / 60));
    for (const r of costRows) {
      await sql(`insert into cost_ledger (call_id, source, units, unit_label, unit_cost_inr, amount_inr, occurred_at, meta) values (${q(call.id)}, ${q(r.source)}, ${r.units}, ${q(r.unit_label)}, ${r.unit_cost_inr}, ${r.amount_inr}, ${q(started)}, ${qj(r.meta ?? {})})`);
    }

    // rules
    const res = qualify(d.ex);
    const [qual] = await sql<{ id: string }>(`insert into qualifications (call_id, lead_id, extraction_id, outcome, decline_reason, flags, rule_trace, rules_version) values (${q(call.id)}, ${q(lead.id)}, ${q(ext.id)}, ${q(res.outcome)}, ${res.decline_reason ? q(res.decline_reason) : 'null'}, ${q('{' + res.flags.join(',') + '}')}, ${qj(res.rule_trace)}, ${q(res.rules_version)}) returning id`);
    console.log(`  ${d.id}: ${res.outcome} ${res.flags.length ? '[' + res.flags.join(',') + ']' : ''}`);

    // routing (demo): handoffs for qualified, escalation, callback
    if (res.outcome === 'QUALIFIED' || res.outcome === 'QUALIFIED_FLAGGED') {
      const principal = designers.find((x) => x.is_principal);
      const designer = (res.flags.includes('VIP') || res.flags.includes('LARGE_PROJECT')) && principal ? principal : designers[rr++ % designers.length];
      const sentAt = new Date(new Date(started).getTime() + 90 * 1000).toISOString();
      // Some claimed quickly, one left unclaimed to populate SLA/guardrails.
      const claimed = d.id !== 'T13';
      const claimAt = claimed ? new Date(new Date(sentAt).getTime() + (d.id === 'T20' ? 6 : 11) * 60000).toISOString() : null;
      const outcome = d.ex.consultation_booked && claimed ? 'booked' : null;
      await sql(`insert into handoffs (lead_id, call_id, qualification_id, designer_id, delivery_channel, recipient, sent_at, claimed_at, claimed_by_designer_id, called_at, outcome, copied_to) values (${q(lead.id)}, ${q(call.id)}, ${q(qual.id)}, ${q(designer.id)}, 'email', ${q(designer.email ?? '')}, ${q(sentAt)}, ${claimAt ? q(claimAt) : 'null'}, ${claimAt ? q(designer.id) : 'null'}, ${outcome ? q(claimAt) : 'null'}, ${outcome ? q(outcome) : 'null'}, null)`);
    } else if (res.outcome === 'ESCALATION') {
      await sql(`insert into escalations (lead_id, call_id, reason, promised_callback_by) values (${q(lead.id)}, ${q(call.id)}, 'existing_client_complaint', ${q(new Date(new Date(started).getTime() + 15 * 60000).toISOString())})`);
    } else if (res.outcome === 'CALLBACK_NEEDED') {
      await sql(`insert into callbacks (lead_id, call_id, reason, scheduled_for) values (${q(lead.id)}, ${q(call.id)}, 'missed', now())`);
    } else if (res.outcome === 'NURTURE') {
      await sql(`insert into tasks (type, lead_id, call_id, assigned_role, title, due_date) values ('nurture', ${q(lead.id)}, ${q(call.id)}, 'front_desk', 'Nurture: re-contact after Diwali', ${q(res.follow_up_date ?? null)})`);
    }
  }
  console.log('demo seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
