import { NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedVoice } from '@/lib/voice/tool-auth';
import { normalizePhone } from '@/lib/pipeline/ingest';

export const maxDuration = 20;
const IST = 'Asia/Kolkata';

/** Tool: book_consultation(slot_id, phone, name?) → books the slot, returns confirmation. */
export async function POST(req: Request) {
  if (!isAuthorizedVoice(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const slotId = body.slot_id as string | undefined;
  const phone = normalizePhone(body.phone);
  if (!slotId) return NextResponse.json({ ok: false, error: 'slot_id required' }, { status: 400 });

  const db = supabaseAdmin();

  // Claim the slot atomically: only succeeds if still available.
  const { data: slot } = await db
    .from('consultation_slots')
    .update({ status: 'booked' })
    .eq('id', slotId)
    .eq('status', 'available')
    .select('id,starts_at,type,designer_id')
    .maybeSingle();
  if (!slot) {
    // Offer the next alternative.
    const { data: alt } = await db
      .from('consultation_slots')
      .select('id,starts_at,type')
      .eq('status', 'available')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      ok: false,
      error: 'slot_unavailable',
      alternative: alt ? { slot_id: alt.id, label: formatInTimeZone(new Date(alt.starts_at), IST, 'EEE d MMM, h:mmaaa') } : null,
    });
  }

  // Upsert lead
  let leadId: string | null = null;
  if (phone) {
    const existing = await db.from('leads').select('id').eq('channel', 'phone').eq('phone', phone).maybeSingle();
    if (existing.data) {
      leadId = existing.data.id;
      if (body.name) await db.from('leads').update({ name: body.name }).eq('id', leadId);
    } else {
      const ins = await db.from('leads').insert({ channel: 'phone', phone, name: body.name ?? null }).select('id').single();
      leadId = ins.data?.id ?? null;
    }
  }

  const { data: designer } = await db.from('designers').select('name').eq('id', slot.designer_id).maybeSingle();

  await db.from('bookings').insert({
    slot_id: slot.id, lead_id: leadId, designer_id: slot.designer_id,
    type: slot.type, starts_at: slot.starts_at, status: 'booked',
  });

  return NextResponse.json({
    ok: true,
    booking: {
      slot_id: slot.id,
      label: formatInTimeZone(new Date(slot.starts_at), IST, 'EEEE d MMMM, h:mmaaa'),
      type: slot.type,
      designer: designer?.name ?? null,
    },
  });
}
