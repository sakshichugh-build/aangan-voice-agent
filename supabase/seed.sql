-- ============================================================================
-- Aangan Studio — seed data
-- Safe to re-run (idempotent via on conflict / guards).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Service areas (from services.md)
-- ----------------------------------------------------------------------------
insert into service_areas (name, region) values
  ('Kothrud','pune'),('Baner','pune'),('Aundh','pune'),('Wakad','pune'),
  ('Koregaon Park','pune'),('Kalyani Nagar','pune'),('Viman Nagar','pune'),
  ('Hadapsar','pune'),('Magarpatta','pune'),('NIBM','pune'),('Kondhwa','pune'),
  ('Undri','pune'),('Shivane','pune'),('Warje','pune'),('Erandwane','pune'),
  ('Deccan','pune'),('Kharadi','pune'),
  ('Pimpri','pcmc'),('Chinchwad','pcmc'),('Pimple Saudagar','pcmc'),
  ('Pimple Nilakh','pcmc'),('Ravet','pcmc'),('Hinjewadi','pcmc')
on conflict (lower(name)) do nothing;

-- ----------------------------------------------------------------------------
-- Designers (14 placeholders; #1 is principal). Telegram unlinked until /start.
-- ----------------------------------------------------------------------------
insert into designers (name, email, is_principal, active, max_open_leads)
select 'Designer ' || g,
       'designer' || g || '@example.com',   -- placeholder; set real emails in Settings
       (g = 1),                             -- Designer 1 = principal
       true,
       5
from generate_series(1,14) g
where not exists (select 1 from designers);

-- ----------------------------------------------------------------------------
-- Rates (placeholders — confirm with Nikhil; all editable in Settings)
-- ----------------------------------------------------------------------------
insert into rates (key, value, currency, note) values
  ('vaani_per_minute_inr',        6.0,  'INR', 'Vaani billed per minute — PLACEHOLDER, confirm'),
  ('claude_in_per_mtok_usd',      2.0,  'USD', 'Claude Sonnet 5.5 input $/1M tokens'),
  ('claude_out_per_mtok_usd',     10.0, 'USD', 'Claude Sonnet 5.5 output $/1M tokens'),
  ('usd_inr_fx',                  88.0, 'INR', 'USD→INR FX — update periodically'),
  ('sms_per_message_inr',         0.20, 'INR', 'SMS per message (if a provider is added)'),
  ('telegram_per_message_inr',    0.0,  'INR', 'Telegram is free'),
  ('supabase_monthly_inr',        0.0,  'INR', 'Supabase fixed monthly — enter actual'),
  ('vercel_monthly_inr',          0.0,  'INR', 'Vercel fixed monthly — enter actual'),
  ('frontdesk_monthly_cost_inr',  40000.0,'INR','Front-desk cost-equivalent for comparison')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Settings (business rules the dashboard can edit). IST throughout.
-- ----------------------------------------------------------------------------
insert into settings (key, value) values
  ('office_hours',            '{"start":"10:00","end":"19:00","days":[1,2,3,4,5,6],"tz":"Asia/Kolkata"}'),
  ('callback_window',         '{"start":"09:00","end":"21:00","tz":"Asia/Kolkata"}'),
  ('after_hours_callback_at', '"09:00"'),
  ('sla',                     '{"claim_minutes":15,"escalate_minutes":30,"designer_call_minutes":60}'),
  ('escalation_callback_minutes', '15'),
  ('budget_thresholds',       '{"residential_full_min_inr":300000,"residential_partial_min_inr":250000,"single_room_min_inr":200000,"commercial_min_inr":300000}'),
  ('commercial_size',         '{"min_sqft":500,"large_flag_sqft":3000}'),
  ('timeline',                '{"min_lead_weeks":6,"target_available_weeks":10}'),
  ('max_open_leads_default',  '5'),
  ('overflow',                '{"mode":"always","rings_before_overflow":4}'),
  ('pipeline_value_band',     '{"min_inr":800000,"max_inr":1400000}')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Consultation slots: 2 weeks of sample availability.
-- For each active designer, weekdays (Mon–Sat), two studio slots (11:00, 16:00)
-- and site-visit designers (principal) get a morning site-visit slot (10:00).
-- Times are built in IST then stored as timestamptz.
-- ----------------------------------------------------------------------------
insert into consultation_slots (designer_id, starts_at, ends_at, type, status)
select d.id,
       ((day::date + t.hr * interval '1 hour') at time zone 'Asia/Kolkata'),
       ((day::date + (t.hr + 1) * interval '1 hour') at time zone 'Asia/Kolkata'),
       t.kind,
       'available'
from designers d
cross join generate_series(current_date + 1, current_date + 14, interval '1 day') as day
cross join (values (11,'studio'), (16,'studio')) as t(hr, kind)
where d.active
  and extract(isodow from day) between 1 and 6     -- Mon–Sat
  and not exists (select 1 from consultation_slots)  -- only seed once
union all
select d.id,
       ((day::date + 10 * interval '1 hour') at time zone 'Asia/Kolkata'),
       ((day::date + 12 * interval '1 hour') at time zone 'Asia/Kolkata'),
       'site_visit',
       'available'
from designers d
cross join generate_series(current_date + 1, current_date + 14, interval '1 day') as day
where d.active and d.is_principal
  and extract(isodow from day) between 1 and 6
  and (select count(*) from consultation_slots) = 0;  -- guarded by same single-seed check
