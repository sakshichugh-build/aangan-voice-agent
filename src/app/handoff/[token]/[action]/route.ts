import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID = new Set(['claim', 'booked', 'no_answer', 'not_a_fit']);

const LABELS: Record<string, string> = {
  claim: 'Claimed',
  booked: 'Marked: Called – booked',
  no_answer: 'Marked: No answer',
  not_a_fit: 'Marked: Not a fit',
};

/** One-tap handoff actions from the email. Token-authenticated, no login. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; action: string }> },
) {
  const { token, action } = await params;
  if (!VALID.has(action)) return page('Unknown action', 'That link is not valid.', false);

  const db = supabaseAdmin();
  const { data: handoff } = await db
    .from('handoffs')
    .select('id,designer_id,claimed_at,outcome')
    .eq('action_token', token)
    .maybeSingle();
  if (!handoff) return page('Link expired', 'We could not find this lead. It may have been reassigned.', false);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  if (action === 'claim') {
    if (handoff.claimed_at) return page('Already claimed', 'This lead was already claimed.', true);
    patch.claimed_at = now;
    patch.claimed_by_designer_id = handoff.designer_id;
  } else {
    // booked / no_answer / not_a_fit
    patch.outcome = action;
    patch.called_at = now;
    if (!handoff.claimed_at) {
      patch.claimed_at = now;
      patch.claimed_by_designer_id = handoff.designer_id;
    }
  }

  await db.from('handoffs').update(patch).eq('id', handoff.id);
  await db.from('audit_log').insert({
    actor: 'designer', action: `handoff_${action}`, entity: 'handoff', entity_id: handoff.id, detail: patch,
  });

  return page(LABELS[action], 'Thanks — this is recorded. You can close this tab.', true);
}

function page(title: string, body: string, ok: boolean): Response {
  const color = ok ? '#047857' : '#b45309';
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f6f6;margin:0;padding:48px 16px;color:#111">
    <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center">
      <div style="font-size:40px;margin-bottom:8px">${ok ? '✅' : '⚠️'}</div>
      <h1 style="font-size:20px;margin:0 0 8px;color:${color}">${title}</h1>
      <p style="color:#555;margin:0">${body}</p>
      <p style="margin-top:20px"><span style="font-weight:600">Aangan Studio</span></p>
    </div>
  </body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
