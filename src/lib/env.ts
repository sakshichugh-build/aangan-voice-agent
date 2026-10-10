/**
 * Centralised env access. We do NOT throw at import time (build/eval contexts
 * may lack some keys); instead each getter validates on first use so a missing
 * key fails loudly at the exact call site, with the exact variable name.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Missing required env var ${name}. Add it to .env.local (and Vercel project env).`,
    );
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  // Supabase
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  // App
  appBaseUrl: () => optional('APP_BASE_URL', 'http://localhost:3000'),
  cronSecret: () => required('CRON_SECRET'),
  voiceProvider: () => optional('VOICE_PROVIDER', 'vaani'),

  // Anthropic
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  anthropicModel: () => optional('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),

  // Email handoff (Resend by default)
  resendApiKey: () => required('RESEND_API_KEY'),
  mailFrom: () => optional('MAIL_FROM', 'Aangan Studio <onboarding@resend.dev>'),
  nikhilEmail: () => optional('NIKHIL_EMAIL'),
  seniorEmail: () => optional('SENIOR_EMAIL'),
  frontdeskEmail: () => optional('FRONTDESK_EMAIL'),

  // Vaani
  vaaniApiKey: () => optional('VAANI_API_KEY'),
  vaaniBaseUrl: () => optional('VAANI_BASE_URL'),
  vaaniWebhookSecret: () => optional('VAANI_WEBHOOK_SECRET'),
  vaaniPhoneNumber: () => optional('VAANI_PHONE_NUMBER'),

  raw: (name: string) => optional(name),
};
