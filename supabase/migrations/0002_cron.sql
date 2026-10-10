-- ============================================================================
-- Migration 0002: pg_cron + pg_net scheduled calls into the Next.js app.
-- Vercel Hobby crons are too coarse (daily), so Supabase drives the clock.
-- Base URL + shared secret live in cron_config (filled AFTER first deploy),
-- so no secret is ever hard-coded in a migration.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One-row config, populated post-deploy:
--   update cron_config set base_url='https://<app>.vercel.app', cron_secret='<secret>' where id=1;
create table if not exists public.cron_config (
  id          integer primary key default 1 check (id = 1),
  base_url    text,
  cron_secret text,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);
insert into public.cron_config (id) values (1) on conflict (id) do nothing;
alter table public.cron_config enable row level security;  -- service-role only

-- Helper: POST to an app cron endpoint with the shared secret header.
create or replace function public.invoke_cron(path text)
returns void language plpgsql security definer set search_path = public as $$
declare cfg public.cron_config;
begin
  select * into cfg from public.cron_config where id = 1;
  if cfg.base_url is null or cfg.enabled is not true then
    return;  -- not configured yet / disabled: no-op
  end if;
  perform net.http_post(
    url     := cfg.base_url || path,
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'x-cron-secret', coalesce(cfg.cron_secret,'')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end $$;

-- (Re)schedule helper jobs. unschedule-if-exists keeps this migration re-runnable.
do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname like 'aangan_%'
  loop execute format('select cron.unschedule(%L)', j.jobname); end loop;

  perform cron.schedule('aangan_process_jobs', '* * * * *',  $cron$ select public.invoke_cron('/api/cron/process-jobs') $cron$);
  perform cron.schedule('aangan_sla',          '* * * * *',  $cron$ select public.invoke_cron('/api/cron/sla') $cron$);
  perform cron.schedule('aangan_callbacks',    '* * * * *',  $cron$ select public.invoke_cron('/api/cron/callbacks') $cron$);
  perform cron.schedule('aangan_reconcile',    '*/5 * * * *',$cron$ select public.invoke_cron('/api/cron/reconcile') $cron$);
end $$;
