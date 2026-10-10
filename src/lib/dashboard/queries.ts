import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Dashboard data layer. Volumes are small (~200 calls/month) so we fetch rows in
 * a date range and aggregate in TS — simple and easy to reason about. Pages are
 * already behind the auth proxy and gated to staff in the dashboard layout.
 */
const IST = 'Asia/Kolkata';

export interface DateRange {
  from: string; // ISO
  to: string; // ISO
}

export function monthRange(d = new Date()): DateRange {
  const y = Number(formatInTimeZone(d, IST, 'yyyy'));
  const m = Number(formatInTimeZone(d, IST, 'MM'));
  const from = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00+05:30`);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function prevMonthRange(r: DateRange): DateRange {
  const from = new Date(r.from);
  const prevFrom = new Date(from);
  prevFrom.setMonth(prevFrom.getMonth() - 1);
  return { from: prevFrom.toISOString(), to: r.from };
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const QUALIFIED = ['QUALIFIED', 'QUALIFIED_FLAGGED'];

export interface OverviewMetrics {
  calls: number;
  afterHoursShare: number; // 0..1
  answeredWithin5minPct: number; // 0..100
  medianAnswerSec: number | null;
  funnel: { calls: number; realLeads: number; qualified: number; booked: number; held: number; won: number };
  declineReasons: { reason: string; count: number }[];
  nurtureQueue: number;
  designerSpeed: {
    medianTimeToClaimMin: number | null;
    pctClaimedUnder15: number;
    pctCalledUnder60: number;
    perDesigner: { name: string; assigned: number; claimed: number; medianClaimMin: number | null }[];
  };
  pipelineValue: { min: number; max: number; qualified: number };
}

export async function getOverview(range: DateRange): Promise<OverviewMetrics> {
  const db = supabaseAdmin();
  const [{ data: calls }, { data: quals }, { data: handoffs }, { data: bookings }, { data: nurture }, { data: band }, { data: designers }] =
    await Promise.all([
      db.from('calls').select('id,started_at,answered_at,after_hours,status').gte('started_at', range.from).lt('started_at', range.to),
      db.from('qualifications').select('id,outcome,decline_reason,created_at').gte('created_at', range.from).lt('created_at', range.to),
      db.from('handoffs').select('id,designer_id,sent_at,claimed_at,called_at,outcome,created_at').gte('created_at', range.from).lt('created_at', range.to),
      db.from('bookings').select('id,status,created_at').gte('created_at', range.from).lt('created_at', range.to),
      db.from('tasks').select('id').eq('type', 'nurture').eq('status', 'open'),
      db.from('settings').select('value').eq('key', 'pipeline_value_band').maybeSingle(),
      db.from('designers').select('id,name'),
    ]);

  const callRows = calls ?? [];
  const qRows = quals ?? [];
  const hRows = handoffs ?? [];

  const afterHours = callRows.filter((c) => c.after_hours).length;
  const answerSecs = callRows
    .filter((c) => c.answered_at && c.started_at)
    .map((c) => (new Date(c.answered_at!).getTime() - new Date(c.started_at!).getTime()) / 1000);
  const within5 = answerSecs.filter((s) => s <= 300).length;

  const qualified = qRows.filter((q) => QUALIFIED.includes(q.outcome)).length;
  const realLeads = qRows.filter((q) => q.outcome !== 'NOT_A_LEAD').length;
  const bookedHandoffs = hRows.filter((h) => h.outcome === 'booked').length;
  const bookingRows = bookings ?? [];
  const booked = Math.max(bookedHandoffs, bookingRows.length);
  const held = bookingRows.filter((b) => b.status === 'completed').length;
  const won = hRows.filter((h) => h.outcome === 'won').length;

  const declineMap = new Map<string, number>();
  for (const q of qRows.filter((q) => q.outcome === 'DECLINED')) {
    const r = q.decline_reason ?? 'unspecified';
    declineMap.set(r, (declineMap.get(r) ?? 0) + 1);
  }

  const claimTimes = hRows
    .filter((h) => h.sent_at && h.claimed_at)
    .map((h) => (new Date(h.claimed_at!).getTime() - new Date(h.sent_at!).getTime()) / 60000);
  const callTimes = hRows
    .filter((h) => h.sent_at && h.called_at)
    .map((h) => (new Date(h.called_at!).getTime() - new Date(h.sent_at!).getTime()) / 60000);
  const sentCount = hRows.filter((h) => h.sent_at).length;

  const dName = new Map((designers ?? []).map((d) => [d.id, d.name]));
  const perDesignerMap = new Map<string, { assigned: number; claimed: number; claims: number[] }>();
  for (const h of hRows) {
    if (!h.designer_id) continue;
    const e = perDesignerMap.get(h.designer_id) ?? { assigned: 0, claimed: 0, claims: [] };
    e.assigned++;
    if (h.claimed_at && h.sent_at) {
      e.claimed++;
      e.claims.push((new Date(h.claimed_at).getTime() - new Date(h.sent_at).getTime()) / 60000);
    }
    perDesignerMap.set(h.designer_id, e);
  }

  const bandVal = (band?.value as { min_inr: number; max_inr: number }) ?? { min_inr: 800000, max_inr: 1400000 };

  return {
    calls: callRows.length,
    afterHoursShare: callRows.length ? afterHours / callRows.length : 0,
    answeredWithin5minPct: answerSecs.length ? (within5 / answerSecs.length) * 100 : 100,
    medianAnswerSec: median(answerSecs),
    funnel: { calls: callRows.length, realLeads, qualified, booked, held, won },
    declineReasons: [...declineMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    nurtureQueue: (nurture ?? []).length,
    designerSpeed: {
      medianTimeToClaimMin: median(claimTimes),
      pctClaimedUnder15: claimTimes.length ? (claimTimes.filter((m) => m <= 15).length / claimTimes.length) * 100 : 0,
      pctCalledUnder60: callTimes.length ? (callTimes.filter((m) => m <= 60).length / callTimes.length) * 100 : 0,
      perDesigner: [...perDesignerMap.entries()]
        .map(([id, e]) => ({ name: dName.get(id) ?? 'Unknown', assigned: e.assigned, claimed: e.claimed, medianClaimMin: median(e.claims) }))
        .sort((a, b) => b.assigned - a.assigned),
    },
    pipelineValue: { min: qualified * bandVal.min_inr, max: qualified * bandVal.max_inr, qualified },
  };
}

export interface CostMetrics {
  bySource: { source: string; amount: number }[];
  total: number;
  perCall: number | null;
  perQualified: number | null;
  perBooked: number | null;
  perWon: number | null;
  counts: { calls: number; qualified: number; booked: number; won: number };
  rates: { key: string; value: number; currency: string | null; note: string | null }[];
  frontdeskEquivalent: number;
  pipelineValue: { min: number; max: number };
}

export async function getCost(range: DateRange): Promise<CostMetrics> {
  const db = supabaseAdmin();
  const [{ data: ledger }, { data: rates }, overview] = await Promise.all([
    db.from('cost_ledger').select('source,amount_inr,occurred_at').gte('occurred_at', range.from).lt('occurred_at', range.to),
    db.from('rates').select('key,value,currency,note').order('key'),
    getOverview(range),
  ]);

  const rows = ledger ?? [];
  const bySourceMap = new Map<string, number>();
  for (const r of rows) bySourceMap.set(r.source, (bySourceMap.get(r.source) ?? 0) + Number(r.amount_inr));

  const rateMap = new Map((rates ?? []).map((r) => [r.key, Number(r.value)]));
  // Add fixed monthly costs (Supabase/Vercel) + Telegram (0) as entries.
  const fixed = (rateMap.get('supabase_monthly_inr') ?? 0) + (rateMap.get('vercel_monthly_inr') ?? 0);
  if (fixed > 0) bySourceMap.set('fixed', (bySourceMap.get('fixed') ?? 0) + fixed);

  const total = [...bySourceMap.values()].reduce((a, b) => a + b, 0);
  const { calls, qualified, booked, won } = overview.funnel;

  return {
    bySource: [...bySourceMap.entries()].map(([source, amount]) => ({ source, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    total: round2(total),
    perCall: calls ? round2(total / calls) : null,
    perQualified: qualified ? round2(total / qualified) : null,
    perBooked: booked ? round2(total / booked) : null,
    perWon: won ? round2(total / won) : null,
    counts: { calls, qualified, booked, won },
    rates: (rates ?? []).map((r) => ({ key: r.key, value: Number(r.value), currency: r.currency, note: r.note })),
    frontdeskEquivalent: rateMap.get('frontdesk_monthly_cost_inr') ?? 0,
    pipelineValue: { min: overview.pipelineValue.min, max: overview.pipelineValue.max },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
