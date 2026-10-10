import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedVoice } from '@/lib/voice/tool-auth';
import { normalizePhone } from '@/lib/pipeline/ingest';

export const maxDuration = 20;

/** Tool: lookup_caller(phone) → existing client? prior enquiries? last outcome. */
export async function POST(req: Request) {
  if (!isAuthorizedVoice(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body.phone);
  if (!phone) return NextResponse.json({ found: false, is_existing_client: false, prior_enquiries: [] });

  const db = supabaseAdmin();
  const [{ data: client }, { data: lead }] = await Promise.all([
    db.from('clients').select('name,assigned_designer_id,project_summary,status').eq('phone', phone).maybeSingle(),
    db.from('leads').select('id,name').eq('channel', 'phone').eq('phone', phone).maybeSingle(),
  ]);

  let designerName: string | null = null;
  if (client?.assigned_designer_id) {
    const { data: d } = await db.from('designers').select('name').eq('id', client.assigned_designer_id).maybeSingle();
    designerName = d?.name ?? null;
  }

  let priorEnquiries: { date: string | null; outcome: string }[] = [];
  let lastOutcome: string | null = null;
  let unfollowed = false;
  if (lead?.id) {
    const { data: quals } = await db
      .from('qualifications')
      .select('outcome,created_at,call_id')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(5);
    priorEnquiries = (quals ?? []).map((q) => ({ date: q.created_at, outcome: q.outcome }));
    lastOutcome = priorEnquiries[0]?.outcome ?? null;
    // Prior qualified enquiry with no claimed handoff → was never followed up (T16).
    if (lead) {
      const { data: openH } = await db.from('handoffs').select('id').eq('lead_id', lead.id).is('claimed_at', null).limit(1);
      unfollowed = (openH?.length ?? 0) > 0;
    }
  }

  return NextResponse.json({
    found: !!(client || lead),
    is_existing_client: !!client,
    name: client?.name ?? lead?.name ?? null,
    assigned_designer: designerName,
    prior_enquiries: priorEnquiries,
    last_outcome: lastOutcome,
    prior_unfollowed: unfollowed,
  });
}
