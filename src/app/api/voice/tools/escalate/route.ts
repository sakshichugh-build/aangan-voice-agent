import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedVoice } from '@/lib/voice/tool-auth';
import { normalizePhone } from '@/lib/pipeline/ingest';
import { loadSettings } from '@/lib/settings/config';
import { emailProvider } from '@/lib/notify/email';
import { env } from '@/lib/env';

export const maxDuration = 20;

/** Tool: escalate(phone, name?, reason) → senior alert + 15-min callback promise. */
export async function POST(req: Request) {
  if (!isAuthorizedVoice(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body.phone);
  const reason = String(body.reason ?? 'existing_client_complaint');

  const db = supabaseAdmin();
  const settings = await loadSettings();
  const minutes = settings.escalationCallbackMinutes;

  // Find/create lead
  let leadId: string | null = null;
  if (phone) {
    const existing = await db.from('leads').select('id').eq('channel', 'phone').eq('phone', phone).maybeSingle();
    leadId = existing.data?.id ?? (await db.from('leads').insert({ channel: 'phone', phone, name: body.name ?? null }).select('id').single()).data?.id ?? null;
  }

  const promisedBy = new Date(Date.now() + minutes * 60000).toISOString();
  await db.from('escalations').insert({ lead_id: leadId, reason, promised_callback_by: promisedBy });

  const to = [env.nikhilEmail(), env.seniorEmail()].filter(Boolean) as string[];
  if (to.length) {
    try {
      await emailProvider().send({
        to,
        subject: `🚨 LIVE ESCALATION — senior callback within ${minutes} min`,
        text: `${body.name ?? 'A caller'} (${phone ?? 'no number'}) needs a senior callback within ${minutes} minutes. Reason: ${reason}.`,
        html: `<p><strong>Live escalation.</strong> ${body.name ?? 'A caller'} (${phone ?? 'no number'}) needs a senior callback within ${minutes} minutes.</p><p>Reason: ${reason}.</p>`,
      });
    } catch (e) {
      console.error('[escalate] email failed:', e);
    }
  }

  return NextResponse.json({ ok: true, promise: `A senior will call back within ${minutes} minutes.` });
}
