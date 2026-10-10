import { env } from '@/lib/env';

/**
 * Email delivery behind a small interface so the provider is swappable and the
 * rest of the app never imports Resend directly (parallels VoiceProvider).
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  cc?: string[];
  replyTo?: string;
}

export interface EmailResult {
  id: string;
  skipped: boolean; // true when no provider configured (dev) — logged, not sent
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<EmailResult>;
}

/** Resend provider (https://resend.com). */
class ResendProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<EmailResult> {
    const key = env.raw('RESEND_API_KEY');
    if (!key) {
      // No provider configured yet — don't crash the pipeline; log and skip.
      console.warn('[email] RESEND_API_KEY not set — skipping send:', msg.subject);
      return { id: 'logged-skip', skipped: true };
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.mailFrom(),
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        cc: msg.cc,
        reply_to: msg.replyTo,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend send failed ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id ?? 'unknown', skipped: false };
  }
}

let _provider: EmailProvider | null = null;
export function emailProvider(): EmailProvider {
  if (_provider) return _provider;
  _provider = new ResendProvider();
  return _provider;
}
