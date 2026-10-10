-- ============================================================================
-- Migration 0004: make dedup indexes non-partial so ON CONFLICT works.
-- Partial unique indexes (… WHERE phone IS NOT NULL) can't be used for ON CONFLICT
-- inference, which silently broke lead dedup and job enqueue in ingestCall.
-- Postgres treats NULLs as distinct, so a plain unique index still allows multiple
-- withheld-number leads / null-call_id jobs.
-- ============================================================================

drop index if exists leads_channel_phone_idx;
create unique index if not exists leads_channel_phone_uniq on leads (channel, phone);

drop index if exists jobs_type_provider_idx;
create unique index if not exists jobs_type_provider_uniq on jobs (type, provider_call_id);
