-- ============================================================================
-- Migration 0003: provider-agnostic LLM cost sources.
-- The brief specified Claude, but extraction runs on Gemini (founder supplied a
-- Gemini key). Cost ledger sources are renamed claude_tokens_* → llm_tokens_*.
-- ============================================================================

-- Migrate any existing rows, then swap the CHECK constraint.
update cost_ledger set source = 'llm_tokens_in'  where source = 'claude_tokens_in';
update cost_ledger set source = 'llm_tokens_out' where source = 'claude_tokens_out';

alter table cost_ledger drop constraint if exists cost_ledger_source_check;
alter table cost_ledger add constraint cost_ledger_source_check
  check (source in ('vaani_minutes','llm_tokens_in','llm_tokens_out','sms','telegram','fixed'));

-- Rename rate keys claude_* → llm_* and set Gemini 2.5 Flash pricing.
update rates set key = 'llm_in_per_mtok_usd',  note = 'Gemini 2.5 Flash input $/1M tokens'  where key = 'claude_in_per_mtok_usd';
update rates set key = 'llm_out_per_mtok_usd', note = 'Gemini 2.5 Flash output $/1M tokens' where key = 'claude_out_per_mtok_usd';
update rates set value = 0.30 where key = 'llm_in_per_mtok_usd';
update rates set value = 2.50 where key = 'llm_out_per_mtok_usd';
