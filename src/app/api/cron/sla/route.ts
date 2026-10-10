import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/http/cron-auth';
import { loadSettings } from '@/lib/settings/config';
import { emailProvider } from '@/lib/notify/email';
import { env } from '@/lib/env';

export const maxDuration = 60;

/** SLA engine: re-ping unclaimed handoffs, escalate to front desk + Nikhil,
 *  and flag overdue senior callbacks. Runs every minute. */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseAdmin();
  const settings = await loadSettings();
  const now = Date.now();
  const actions: string[] = [];

  // Unclaimed handoffs (sent, not claimed, not resolved)
  const { data: handoffs } = await db
    .from('handoffs')
    .select('id,recipient,action_token,sent_at,claimed_at,escalated_at,reping_count,lead_id,designer_id')
    .not('sent_at', 'is', null)
    .is('claimed_at', null)
    .is('outcome', null);

  for (const h of handoffs ?? []) {
    const sent = h.sent_at ? new Date(h.sent_at).getTime() : now;
    const mins = (now - sent) / 60000;

    // Re-ping once at claim_minutes
    if (mins >= settings.sla.claim_minutes && (h.reping_count ?? 0) < 1 && h.recipient) {
      await safeEmail({
        to: h.recipient,
        subject: 'Reminder: a new lead is still unclaimed',
        text: `A qualified lead is waiting. Claim it: ${env.appBaseUrl()}/handoff/${h.action_token}/claim`,
        html: `<p>A qualified lead is still unclaimed. Please <a href="${env.appBaseUrl()}/handoff/${h.action_token}/claim">claim it</a> — reply within the hour (4× conversion).</p>`,
      });
      await db.from('handoffs').update({ reping_count: 1 }).eq('id', h.id);
      actions.push(`reping ${h.id}`);
    }

    // Escalate once at escalate_minutes → front desk + Nikhil
    if (mins >= settings.sla.escalate_minutes && !h.escalated_at) {
      const to = [env.frontdeskEmail(), env.nikhilEmail()].filter(Boolean) as string[];
      if (to.length) {
        await safeEmail({
          to,
          subject: '⚠️ Lead unclaimed past SLA — please pick up',
          text: `A qualified lead has been unclaimed for ${Math.round(mins)} min. Claim: ${env.appBaseUrl()}/handoff/${h.action_token}/claim`,
          html: `<p>A qualified lead has been unclaimed for ${Math.round(mins)} minutes. <a href="${env.appBaseUrl()}/handoff/${h.action_token}/claim">Claim it</a>.</p>`,
        });
      }
      await db.from('handoffs').update({ escalated_at: new Date().toISOString() }).eq('id', h.id);
      actions.push(`escalate ${h.id}`);
    }
  }

  // Overdue senior callbacks (escalations) → one front-desk task, deduped
  const { data: escalations } = await db
    .from('escalations')
    .select('id,call_id,lead_id,promised_callback_by,callback_happened,resolved_at')
    .eq('callback_happened', false)
    .is('resolved_at', null)
    .lt('promised_callback_by', new Date().toISOString());
  for (const esc of escalations ?? []) {
    const { data: existing } = await db
      .from('tasks')
      .select('id')
      .eq('call_id', esc.call_id)
      .eq('type', 'front_desk')
      .ilike('title', 'Overdue senior callback%')
      .maybeSingle();
    if (existing) continue;
    await db.from('tasks').insert({
      type: 'front_desk', call_id: esc.call_id, lead_id: esc.lead_id, assigned_role: 'founder',
      title: 'Overdue senior callback — escalation', notes: 'Promised senior callback window elapsed. Confirm it happened.',
    });
    actions.push(`overdue-callback ${esc.id}`);
  }

  return NextResponse.json({ ok: true, actions });
}

async function safeEmail(msg: Parameters<ReturnType<typeof emailProvider>['send']>[0]) {
  try {
    return await emailProvider().send(msg);
  } catch (e) {
    console.error('[sla] email failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
