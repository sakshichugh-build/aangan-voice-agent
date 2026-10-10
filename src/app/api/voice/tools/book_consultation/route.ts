import { NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedVoice } from '@/lib/voice/tool-auth';
import { normalizePhone } from '@/lib/pipeline/ingest';
import { emailProvider } from '@/lib/notify/email';
import { renderConfirmation } from '@/lib/notify/confirmation';

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

  const email = typeof body.email === 'string' && body.email.includes('@') ? body.email.trim() : null;

  // Upsert lead (store name + email)
  let leadId: string | null = null;
  if (phone) {
    const existing = await db.from('leads').select('id').eq('channel', 'phone').eq('phone', phone).maybeSingle();
    const patch: Record<string, unknown> = {};
    if (body.name) patch.name = body.name;
    if (email) patch.email = email;
    if (existing.data) {
      leadId = existing.data.id;
      if (Object.keys(patch).length) await db.from('leads').update(patch).eq('id', leadId);
    } else {
      const ins = await db.from('leads').insert({ channel: 'phone', phone, ...patch }).select('id').single();
      leadId = ins.data?.id ?? null;
    }
  }

  const { data: designer } = await db.from('designers').select('name').eq('id', slot.designer_id).maybeSingle();
  const whenLabel = formatInTimeZone(new Date(slot.starts_at), IST, 'EEEE d MMMM, h:mmaaa');

  await db.from('bookings').insert({
    slot_id: slot.id, lead_id: leadId, designer_id: slot.designer_id,
    type: slot.type, starts_at: slot.starts_at, status: 'booked', customer_email: email,
  });

  // Send the caller a branded confirmation email (skips cleanly if no email / no provider).
  let emailed = false;
  if (email) {
    try {
      const note = renderConfirmation({ name: (body.name as string) ?? null, whenLabel, type: slot.type, designer: designer?.name ?? null });
      const res = await emailProvider().send({ to: email, subject: note.subject, text: note.text, html: note.html });
      emailed = !res.skipped;
    } catch (e) {
      console.error('[book_consultation] confirmation email failed:', e);
    }
  }

  return NextResponse.json({
    ok: true,
    booking: {
      slot_id: slot.id,
      label: whenLabel,
      type: slot.type,
      designer: designer?.name ?? null,
      confirmation_emailed: emailed,
    },
  });
}
