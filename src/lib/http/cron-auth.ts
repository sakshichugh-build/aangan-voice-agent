import { env } from '@/lib/env';

/** Cron/webhook routes are guarded by a shared secret header. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = req.headers.get('x-cron-secret');
  try {
    return !!secret && secret === env.cronSecret();
  } catch {
    return false;
  }
}
