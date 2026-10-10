import { env } from '@/lib/env';

/**
 * Auth for Vaani → our tool/webhook endpoints. Accepts the Vaani webhook secret
 * (preferred) or the cron secret, via any of the common header names.
 */
export function isAuthorizedVoice(req: Request): boolean {
  const got =
    req.headers.get('x-vaani-secret') ??
    req.headers.get('x-webhook-secret') ??
    req.headers.get('x-cron-secret') ??
    bearer(req);
  if (!got) return false;
  const vaani = env.vaaniWebhookSecret();
  let cron = '';
  try { cron = env.cronSecret(); } catch { /* ignore */ }
  return (!!vaani && got === vaani) || (!!cron && got === cron);
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  return h?.toLowerCase().startsWith('bearer ') ? h.slice(7) : null;
}
