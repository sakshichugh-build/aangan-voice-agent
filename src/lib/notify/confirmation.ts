/** Email sent to the caller with the Calendly booking link (pick-your-time). */
export function renderBookingLink(name: string | null, calendlyUrl: string): { subject: string; text: string; html: string } {
  const hi = name ? `Hi ${name},` : 'Hello,';
  const subject = 'Book your Aangan Studio consultation';
  const text = `${hi}

Thanks for calling Aangan Studio. Pick a consultation time that suits you here:

  ${calendlyUrl}

Once you choose a slot you'll get a confirmation and calendar invite, and your designer will be ready with everything you shared on the call.

— Aangan Studio, Pune`;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
  <div style="max-width:520px;margin:0 auto;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
    <h1 style="font-size:20px;margin:0 0 4px">Aangan Studio</h1>
    <p style="color:#666;margin:0 0 16px">Interior design · Pune</p>
    <p>${esc(hi)}</p>
    <p>Thanks for calling. Pick a consultation time that suits you:</p>
    <p style="margin:18px 0">
      <a href="${esc(calendlyUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Choose your time →</a>
    </p>
    <p style="color:#555">Once you pick a slot you'll get a confirmation and calendar invite, and your designer will be ready with everything you shared on the call.</p>
    <p style="color:#666;margin-top:20px">— Aangan Studio</p>
  </div>`;
  return { subject, text, html };
}

/** Branded consultation-confirmation email sent to the caller after booking. */
export interface ConfirmationInput {
  name: string | null;
  whenLabel: string; // e.g. "Tuesday 14 October, 11:00am"
  type: 'studio' | 'site_visit';
  designer: string | null;
}

export function renderConfirmation(c: ConfirmationInput): { subject: string; text: string; html: string } {
  const typeLabel = c.type === 'site_visit' ? 'site visit' : 'studio consultation';
  const hi = c.name ? `Hi ${c.name},` : 'Hello,';
  const subject = `Your Aangan Studio consultation — ${c.whenLabel}`;

  const text = `${hi}

Your ${typeLabel} with Aangan Studio is confirmed:

  ${c.whenLabel}${c.designer ? `\n  Designer: ${c.designer}` : ''}

We're looking forward to understanding your space and what you'd like to create.
If you need to change the time, just reply to this email or call us.

— Aangan Studio, Pune`;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
  <div style="max-width:520px;margin:0 auto;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
    <h1 style="font-size:20px;margin:0 0 4px">Aangan Studio</h1>
    <p style="color:#666;margin:0 0 16px">Interior design · Pune</p>
    <p>${esc(hi)}</p>
    <p>Your <strong>${typeLabel}</strong> is confirmed:</p>
    <div style="background:#f6f6f6;border-radius:12px;padding:16px;margin:12px 0">
      <div style="font-size:18px;font-weight:600">${esc(c.whenLabel)}</div>
      ${c.designer ? `<div style="color:#555;margin-top:4px">With ${esc(c.designer)}</div>` : ''}
    </div>
    <p>We're looking forward to understanding your space and what you'd like to create. Need to change the time? Just reply to this email or call us.</p>
    <p style="color:#666;margin-top:20px">— Aangan Studio</p>
  </div>`;
  return { subject, text, html };
}
