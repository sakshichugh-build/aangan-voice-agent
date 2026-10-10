-- ============================================================================
-- Migration 0006: capture the caller's email (asked on the call) for
-- booking confirmations.
-- ============================================================================
alter table leads    add column if not exists email text;
alter table bookings add column if not exists customer_email text;
