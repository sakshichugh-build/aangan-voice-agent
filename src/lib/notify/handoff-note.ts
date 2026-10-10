import type { Extraction } from '@/lib/qualify/schema';
import type { Flag, Outcome } from '@/lib/qualify/rules';

/**
 * Renders the designer handoff note — "everything already asked" (§7).
 * Produces both a plain-text version (for logs / fallback) and an HTML version
 * (for the email), plus the four action buttons as tokenized links.
 */

export interface HandoffContext {
  outcome: Outcome;
  flags: Flag[];
  ex: Extraction;
  calledAtLabel: string; // e.g. "11:42pm (after hours)"
  answeredInLabel: string; // e.g. "0s"
  durationLabel: string; // e.g. "4m12s"
  booking?: { whenLabel: string; type: 'studio' | 'site_visit'; designerName?: string } | null;
  appBaseUrl: string;
  actionToken: string;
  transcriptUrl?: string | null;
}

function titleLine(outcome: Outcome): string {
  if (outcome === 'QUALIFIED') return '🟢 NEW QUALIFIED LEAD — reply within 1 hr (4× conversion)';
  if (outcome === 'QUALIFIED_FLAGGED') return '🟡 NEW QUALIFIED LEAD (flagged) — reply within 1 hr';
  return 'NEW LEAD';
}

function orNA(v: string | null | undefined): string {
  return v && v.trim() ? v : '—';
}

function budgetLine(ex: Extraction): string {
  if (!ex.budget_volunteered) return 'not mentioned';
  if (ex.budget_inr_min && ex.budget_inr_max) return `₹${ex.budget_inr_min / 100000}–${ex.budget_inr_max / 100000}L (volunteered)`;
  return 'volunteered (unspecified)';
}

function scopeLine(ex: Extraction): string {
  const parts: string[] = [];
  if (ex.rooms_scope?.length) parts.push(ex.rooms_scope.join(', '));
  if (ex.current_state) parts.push(ex.current_state);
  if (ex.is_rented) parts.push('rented');
  return parts.join(' · ') || '—';
}

function headline(ex: Extraction): string {
  const bits = [
    ex.project_type.replace(/_/g, ' '),
    ex.locality ? ex.locality : null,
    ex.carpet_area_sqft ? `~${ex.carpet_area_sqft} sq ft carpet` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

export interface RenderedHandoff {
  subject: string;
  text: string;
  html: string;
}

export function renderHandoff(ctx: HandoffContext): RenderedHandoff {
  const { ex, flags, appBaseUrl, actionToken } = ctx;
  const name = orNA(ex.caller_name);
  const phone = orNA(ex.phone);
  const lang = orNA(ex.language);

  const consult = ctx.booking
    ? `BOOKED ${ctx.booking.whenLabel}, ${ctx.booking.type === 'site_visit' ? 'site visit' : 'studio'}${ctx.booking.designerName ? ` · ${ctx.booking.designerName}` : ''}`
    : ex.preferred_slots?.length
      ? `not booked · prefers ${ex.preferred_slots.join(', ')}`
      : 'not booked';

  const subject = `${ctx.outcome === 'QUALIFIED_FLAGGED' ? '🟡' : '🟢'} ${name} · ${headline(ex)}`;

  const lines = [
    titleLine(ctx.outcome),
    '',
    `${name} · ${phone} · ${lang}`,
    headline(ex),
    `Scope: ${scopeLine(ex)}`,
    `Timeline: ${orNA(ex.timeline_text)}`,
    `Decision-maker: ${ex.decision_maker.replace(/_/g, ' ')}`,
    `Budget: ${budgetLine(ex)}`,
    `Source: ${orNA(ex.referral_source)}${ex.referral_name ? ` — ${ex.referral_name}` : ''}`,
    `Consultation: ${consult}`,
    flags.length ? `Flags: ${flags.join(', ')}` : 'Flags: —',
    ex.open_questions_for_designer?.length ? `Ask at consult: ${ex.open_questions_for_designer.join('; ')}` : '',
    '',
    ex.summary_for_designer,
    '',
    `Called ${ctx.calledAtLabel} · answered in ${ctx.answeredInLabel} · ${ctx.durationLabel}`,
  ].filter((l) => l !== '');

  const actionUrl = (action: string) => `${appBaseUrl}/handoff/${actionToken}/${action}`;

  const text =
    lines.join('\n') +
    '\n\n' +
    `Claim:        ${actionUrl('claim')}\n` +
    `Called–booked: ${actionUrl('booked')}\n` +
    `No answer:    ${actionUrl('no_answer')}\n` +
    `Not a fit:    ${actionUrl('not_a_fit')}\n` +
    (ctx.transcriptUrl ? `Transcript:   ${ctx.transcriptUrl}\n` : '');

  const btn = (label: string, action: string, color: string) =>
    `<a href="${actionUrl(action)}" style="display:inline-block;padding:10px 16px;margin:4px 6px 4px 0;border-radius:8px;background:${color};color:#fff;text-decoration:none;font:600 14px system-ui">${label}</a>`;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `
  <div style="max-width:560px;margin:0 auto;font:14px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
    <p style="font-weight:700;font-size:16px;margin:0 0 12px">${esc(titleLine(ctx.outcome))}</p>
    <table style="border-collapse:collapse;width:100%">
      ${row('Caller', `${esc(name)} · ${esc(phone)} · ${esc(lang)}`)}
      ${row('Project', esc(headline(ex)))}
      ${row('Scope', esc(scopeLine(ex)))}
      ${row('Timeline', esc(orNA(ex.timeline_text)))}
      ${row('Decision-maker', esc(ex.decision_maker.replace(/_/g, ' ')))}
      ${row('Budget', esc(budgetLine(ex)))}
      ${row('Source', esc(orNA(ex.referral_source)) + (ex.referral_name ? ` — ${esc(ex.referral_name)}` : ''))}
      ${row('Consultation', `<strong>${esc(consult)}</strong>`)}
      ${flags.length ? row('Flags', flags.map((f) => `<span style="background:#fde68a;border-radius:4px;padding:1px 6px;margin-right:4px;font-size:12px">${esc(f)}</span>`).join('')) : ''}
      ${ex.open_questions_for_designer?.length ? row('Ask at consult', esc(ex.open_questions_for_designer.join('; '))) : ''}
    </table>
    <p style="margin:14px 0;white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:8px">${esc(ex.summary_for_designer)}</p>
    <p style="color:#666;font-size:12px;margin:8px 0">Called ${esc(ctx.calledAtLabel)} · answered in ${esc(ctx.answeredInLabel)} · ${esc(ctx.durationLabel)}</p>
    <div style="margin:16px 0">
      ${btn('Claim', 'claim', '#111827')}
      ${btn('Called – booked', 'booked', '#047857')}
      ${btn('No answer', 'no_answer', '#b45309')}
      ${btn('Not a fit', 'not_a_fit', '#6b7280')}
    </div>
    ${ctx.transcriptUrl ? `<p><a href="${ctx.transcriptUrl}" style="color:#2563eb">▶ transcript</a></p>` : ''}
  </div>`;

  return { subject, text, html };
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 10px 4px 0;color:#666;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:4px 0">${value}</td></tr>`;
}
