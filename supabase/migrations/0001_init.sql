-- ============================================================================
-- Aangan Studio — "Never-Miss" Phone Enquiry Agent
-- Migration 0001: core schema, constraints, indexes, RLS
-- ----------------------------------------------------------------------------
-- Design notes:
--   * AI extracts, CODE decides. Outcomes are deterministic (rules engine).
--   * Supabase is the system of record; Telegram is only a delivery channel.
--   * All writes from the pipeline/webhooks use the service role (bypasses RLS).
--     Dashboard reads use the user's session and are governed by RLS below.
--   * Enum-like columns use TEXT + CHECK (cheaper to evolve than PG enums).
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Auth profiles (roles: founder / front_desk / designer)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  role          text not null default 'front_desk'
                  check (role in ('founder','front_desk','designer')),
  designer_id   uuid,                 -- FK added after designers table exists
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Designers (business entity; the 14 people who receive handoffs)
-- ----------------------------------------------------------------------------
create table if not exists designers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text,                     -- E.164
  email               text,                     -- handoff notes are emailed here
  is_principal        boolean not null default false,
  active              boolean not null default true,
  max_open_leads      integer not null default 5,
  created_at          timestamptz not null default now()
);

alter table profiles
  add constraint profiles_designer_fk
  foreign key (designer_id) references designers(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Existing clients (for escalation lookup on inbound calls)
-- ----------------------------------------------------------------------------
create table if not exists clients (
  id                    uuid primary key default gen_random_uuid(),
  name                  text,
  phone                 text not null,          -- E.164
  assigned_designer_id  uuid references designers(id) on delete set null,
  project_summary       text,
  status                text default 'active',
  created_at            timestamptz not null default now()
);
create index if not exists clients_phone_idx on clients (phone);

-- ----------------------------------------------------------------------------
-- Service areas (localities we serve; seeded from services.md)
-- ----------------------------------------------------------------------------
create table if not exists service_areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text not null check (region in ('pune','pcmc')),
  in_service  boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists service_areas_name_idx on service_areas (lower(name));

-- ----------------------------------------------------------------------------
-- Leads (one per person/phone/channel; channel column ready for WhatsApp/web)
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id                 uuid primary key default gen_random_uuid(),
  channel            text not null default 'phone'
                       check (channel in ('phone','whatsapp','web')),
  phone              text,                       -- E.164 (may be null if withheld)
  name               text,
  is_existing_client boolean not null default false,
  client_id          uuid references clients(id) on delete set null,
  first_contact_at   timestamptz not null default now(),
  last_contact_at    timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
-- Dedup: one lead per (channel, phone) when phone is known.
create unique index if not exists leads_channel_phone_idx
  on leads (channel, phone) where phone is not null;

-- ----------------------------------------------------------------------------
-- Calls (one per call; idempotent on provider_call_id)
-- ----------------------------------------------------------------------------
create table if not exists calls (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid references leads(id) on delete set null,
  provider          text not null default 'vaani',
  provider_call_id  text not null,
  direction         text not null default 'inbound'
                      check (direction in ('inbound','outbound')),
  from_number       text,
  to_number         text,
  started_at        timestamptz,
  ended_at          timestamptz,
  answered_at       timestamptz,
  duration_sec      integer,
  recording_url     text,
  language          text,
  after_hours       boolean not null default false,
  status            text not null default 'in_progress'
                      check (status in ('in_progress','completed','missed','dropped','failed')),
  raw_payload       jsonb,
  created_at        timestamptz not null default now()
);
create unique index if not exists calls_provider_call_id_idx
  on calls (provider, provider_call_id);
create index if not exists calls_lead_idx on calls (lead_id);
create index if not exists calls_started_idx on calls (started_at);

-- ----------------------------------------------------------------------------
-- Transcripts (one per call)
-- ----------------------------------------------------------------------------
create table if not exists transcripts (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid not null references calls(id) on delete cascade,
  full_text   text,
  turns       jsonb,                             -- [{speaker,text,ts}]
  source      text not null default 'vaani' check (source in ('vaani','reconcile','seed')),
  created_at  timestamptz not null default now()
);
create unique index if not exists transcripts_call_idx on transcripts (call_id);

-- ----------------------------------------------------------------------------
-- Extractions (Claude output: JSON + model + version + token usage)
-- ----------------------------------------------------------------------------
create table if not exists extractions (
  id             uuid primary key default gen_random_uuid(),
  call_id        uuid references calls(id) on delete cascade,
  lead_id        uuid references leads(id) on delete set null,
  data           jsonb not null,
  model          text,
  prompt_version text,
  input_tokens   integer,
  output_tokens  integer,
  valid          boolean not null default true,
  attempts       integer not null default 1,
  created_at     timestamptz not null default now()
);
create index if not exists extractions_call_idx on extractions (call_id);

-- ----------------------------------------------------------------------------
-- Qualifications (deterministic outcome + flags + full rule trace)
-- ----------------------------------------------------------------------------
create table if not exists qualifications (
  id             uuid primary key default gen_random_uuid(),
  call_id        uuid references calls(id) on delete cascade,
  lead_id        uuid references leads(id) on delete set null,
  extraction_id  uuid references extractions(id) on delete set null,
  outcome        text not null check (outcome in (
                   'QUALIFIED','QUALIFIED_FLAGGED','NURTURE','DECLINED',
                   'ESCALATION','CALLBACK_NEEDED','NEEDS_REVIEW','NOT_A_LEAD')),
  decline_reason text,
  flags          text[] not null default '{}',
  rule_trace     jsonb not null default '[]',
  rules_version  text,
  created_at     timestamptz not null default now()
);
create index if not exists qualifications_call_idx on qualifications (call_id);
create index if not exists qualifications_outcome_idx on qualifications (outcome);

-- ----------------------------------------------------------------------------
-- Consultation slots (designer availability)
-- ----------------------------------------------------------------------------
create table if not exists consultation_slots (
  id           uuid primary key default gen_random_uuid(),
  designer_id  uuid not null references designers(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  type         text not null default 'studio' check (type in ('studio','site_visit')),
  status       text not null default 'available'
                 check (status in ('available','held','booked','cancelled')),
  created_at   timestamptz not null default now()
);
create index if not exists slots_avail_idx on consultation_slots (status, starts_at);
create index if not exists slots_designer_idx on consultation_slots (designer_id, starts_at);

-- ----------------------------------------------------------------------------
-- Bookings
-- ----------------------------------------------------------------------------
create table if not exists bookings (
  id           uuid primary key default gen_random_uuid(),
  slot_id      uuid references consultation_slots(id) on delete set null,
  lead_id      uuid references leads(id) on delete set null,
  call_id      uuid references calls(id) on delete set null,
  designer_id  uuid references designers(id) on delete set null,
  type         text not null default 'studio' check (type in ('studio','site_visit')),
  starts_at    timestamptz,
  status       text not null default 'booked'
                 check (status in ('held','booked','completed','cancelled','no_show')),
  created_at   timestamptz not null default now()
);
create index if not exists bookings_lead_idx on bookings (lead_id);

-- ----------------------------------------------------------------------------
-- Handoffs (Telegram delivery + SLA tracking)
-- ----------------------------------------------------------------------------
create table if not exists handoffs (
  id                     uuid primary key default gen_random_uuid(),
  lead_id                uuid references leads(id) on delete set null,
  call_id                uuid references calls(id) on delete cascade,
  qualification_id       uuid references qualifications(id) on delete set null,
  designer_id            uuid references designers(id) on delete set null,  -- assigned
  delivery_channel       text not null default 'email' check (delivery_channel in ('email','telegram')),
  recipient              text,                   -- designer email
  provider_message_id    text,                   -- email provider message id
  action_token           text unique default encode(gen_random_bytes(16),'hex'), -- one-click claim links
  copied_to              text[],                 -- extra recipients (e.g. Nikhil)
  sent_at                timestamptz,
  claimed_at             timestamptz,
  claimed_by_designer_id uuid references designers(id) on delete set null,
  called_at              timestamptz,
  outcome                text check (outcome in ('booked','no_answer','not_a_fit','won','lost')),
  reping_count           integer not null default 0,
  escalated_at           timestamptz,
  created_at             timestamptz not null default now()
);
create index if not exists handoffs_call_idx on handoffs (call_id);
create index if not exists handoffs_sla_idx on handoffs (sent_at, claimed_at);

-- ----------------------------------------------------------------------------
-- Escalations (existing-client complaints, angry repeat callers)
-- ----------------------------------------------------------------------------
create table if not exists escalations (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid references leads(id) on delete set null,
  call_id              uuid references calls(id) on delete cascade,
  reason               text not null,
  promised_callback_by timestamptz,              -- 15 min SLA
  provider_message_id  text,                     -- alert email message id
  callback_happened    boolean not null default false,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists escalations_call_idx on escalations (call_id);

-- ----------------------------------------------------------------------------
-- Callbacks (missed/dropped/short calls → auto outbound)
-- ----------------------------------------------------------------------------
create table if not exists callbacks (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid references leads(id) on delete set null,
  call_id           uuid references calls(id) on delete set null,
  reason            text not null check (reason in ('missed','dropped','short_no_content','tool_failed','manual')),
  scheduled_for     timestamptz not null,
  attempts          integer not null default 0,
  max_attempts      integer not null default 2,
  status            text not null default 'pending'
                      check (status in ('pending','in_progress','completed','failed','cancelled')),
  provider_call_id  text,                        -- the resulting outbound call
  created_at        timestamptz not null default now()
);
create index if not exists callbacks_due_idx on callbacks (status, scheduled_for);

-- ----------------------------------------------------------------------------
-- Tasks (nurture follow-ups, front-desk fallbacks)
-- ----------------------------------------------------------------------------
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('nurture','front_desk','callback_fallback','confirm_booking','other')),
  lead_id       uuid references leads(id) on delete set null,
  call_id       uuid references calls(id) on delete set null,
  title         text not null,
  notes         text,
  due_date      date,
  assigned_role text check (assigned_role in ('founder','front_desk','designer')),
  status        text not null default 'open' check (status in ('open','done','cancelled')),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists tasks_status_idx on tasks (status, due_date);

-- ----------------------------------------------------------------------------
-- Guardrail events (pricing leaks, promise violations, extraction failures)
-- ----------------------------------------------------------------------------
create table if not exists guardrail_events (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid references calls(id) on delete cascade,
  lead_id     uuid references leads(id) on delete set null,
  type        text not null check (type in ('pricing_leak','promise_violation','extraction_failed')),
  severity    text not null default 'high' check (severity in ('high','medium','low')),
  detail      text,
  evidence    text,                              -- matched snippet / quote
  method      text check (method in ('regex','claude','system')),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists guardrail_type_idx on guardrail_events (type, resolved);

-- ----------------------------------------------------------------------------
-- Cost ledger (one row per billable item)
-- ----------------------------------------------------------------------------
create table if not exists cost_ledger (
  id            uuid primary key default gen_random_uuid(),
  call_id       uuid references calls(id) on delete set null,
  source        text not null check (source in (
                  'vaani_minutes','claude_tokens_in','claude_tokens_out',
                  'sms','telegram','fixed')),
  units         numeric not null default 0,
  unit_label    text,                            -- minutes / tokens / messages / month
  unit_cost_inr numeric not null default 0,
  amount_inr    numeric not null default 0,
  meta          jsonb,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists cost_ledger_occurred_idx on cost_ledger (occurred_at);
create index if not exists cost_ledger_source_idx on cost_ledger (source);

-- ----------------------------------------------------------------------------
-- Rates (editable; never hard-code pricing of the system itself)
-- ----------------------------------------------------------------------------
create table if not exists rates (
  key         text primary key,
  value       numeric not null,
  currency    text,
  note        text,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Settings (key/value JSON)
-- ----------------------------------------------------------------------------
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Jobs (post-call pipeline queue; idempotent per provider_call_id)
-- ----------------------------------------------------------------------------
create table if not exists jobs (
  id                uuid primary key default gen_random_uuid(),
  type              text not null default 'post_call_pipeline',
  call_id           uuid references calls(id) on delete cascade,
  provider_call_id  text,
  payload           jsonb,
  status            text not null default 'pending'
                      check (status in ('pending','processing','done','failed','dead')),
  attempts          integer not null default 0,
  max_attempts      integer not null default 5,
  last_error        text,
  run_after         timestamptz not null default now(),
  locked_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Idempotency: never enqueue the same pipeline twice for a call.
create unique index if not exists jobs_type_provider_idx
  on jobs (type, provider_call_id) where provider_call_id is not null;
create index if not exists jobs_runnable_idx on jobs (status, run_after);

-- ----------------------------------------------------------------------------
-- Audit log
-- ----------------------------------------------------------------------------
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor       text,                              -- user id / 'system' / 'cron'
  action      text not null,
  entity      text,
  entity_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_entity_idx on audit_log (entity, entity_id);

-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Policy model:
--   * Service role (server pipeline, webhooks, crons) BYPASSES RLS entirely.
--   * Dashboard uses the signed-in user's session:
--       - founder / front_desk : SELECT on all operational tables.
--       - designer             : SELECT limited to their own handoffs/leads/calls.
--   * All mutations from the dashboard go through server actions using the
--     service role after an explicit role check, so no INSERT/UPDATE/DELETE
--     policies are granted to normal users (default-deny).
-- ============================================================================

-- role helper (reads the caller's profile)
create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_designer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select designer_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('founder','front_desk'), false)
$$;

-- Enable RLS on every table
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','designers','clients','service_areas','leads','calls','transcripts',
    'extractions','qualifications','consultation_slots','bookings','handoffs',
    'escalations','callbacks','tasks','guardrail_events','cost_ledger','rates',
    'settings','jobs','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- profiles: a user can read their own row; staff can read all
create policy profiles_self_read on profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- Staff read-all on operational tables
do $$
declare t text;
begin
  foreach t in array array[
    'designers','clients','service_areas','leads','calls','transcripts',
    'extractions','qualifications','consultation_slots','bookings',
    'escalations','callbacks','tasks','guardrail_events','cost_ledger','rates',
    'settings','jobs','audit_log'
  ] loop
    execute format(
      'create policy %I on public.%I for select using (public.is_staff());',
      t || '_staff_read', t);
  end loop;
end $$;

-- Designers: read their own handoffs + the lead/call behind them
create policy handoffs_staff_read on handoffs for select using (public.is_staff());
create policy handoffs_designer_read on handoffs for select
  using (designer_id = public.auth_designer_id()
         or claimed_by_designer_id = public.auth_designer_id());

create policy leads_designer_read on leads for select
  using (exists (select 1 from handoffs h
                 where h.lead_id = leads.id
                   and (h.designer_id = public.auth_designer_id()
                        or h.claimed_by_designer_id = public.auth_designer_id())));

create policy calls_designer_read on calls for select
  using (exists (select 1 from handoffs h
                 where h.call_id = calls.id
                   and (h.designer_id = public.auth_designer_id()
                        or h.claimed_by_designer_id = public.auth_designer_id())));

-- ============================================================================
-- updated_at touch trigger for jobs
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger jobs_touch_updated before update on jobs
  for each row execute function public.touch_updated_at();
