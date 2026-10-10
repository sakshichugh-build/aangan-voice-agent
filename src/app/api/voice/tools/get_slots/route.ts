import { NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedVoice } from '@/lib/voice/tool-auth';

export const maxDuration = 20;
const IST = 'Asia/Kolkata';

/** Tool: get_slots(type?) → the next available consultation slots to offer. */
export async function POST(req: Request) {
  if (!isAuthorizedVoice(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const type = body.type === 'site_visit' ? 'site_visit' : body.type === 'studio' ? 'studio' : null;
  const limit = Math.min(Number(body.limit ?? 2), 6);

  const db = supabaseAdmin();
  let qb = db
    .from('consultation_slots')
    .select('id,starts_at,ends_at,type,designer_id')
    .eq('status', 'available')
    .gt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(200); // fetch enough rows to find `limit` DISTINCT start times across designers
  if (type) qb = qb.eq('type', type);
  const { data: slots } = await qb;

  const designerIds = [...new Set((slots ?? []).map((s) => s.designer_id))];
  const { data: designers } = designerIds.length
    ? await db.from('designers').select('id,name').in('id', designerIds)
    : { data: [] as { id: string; name: string }[] };
  const dName = new Map((designers ?? []).map((d) => [d.id, d.name]));

  // Offer one slot per distinct start time (avoid two designers same hour).
  const seen = new Set<string>();
  const offered = (slots ?? [])
    .filter((s) => { const k = s.starts_at; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit)
    .map((s) => ({
      slot_id: s.id,
      type: s.type,
      starts_at: s.starts_at,
      label: formatInTimeZone(new Date(s.starts_at), IST, "EEE d MMM, h:mmaaa"),
      designer: dName.get(s.designer_id) ?? null,
    }));

  return NextResponse.json({ slots: offered });
}
