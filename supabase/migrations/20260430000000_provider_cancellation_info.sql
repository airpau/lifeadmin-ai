-- Additive extension to provider_cancellation_info (created in
-- 20260424070000_provider_cancellation_info.sql). The original PR #369
-- shipped this file as a CREATE TABLE IF NOT EXISTS with a different
-- column shape (provider_name / provider_key / city / notice_period_days),
-- which made it a silent no-op in environments where the original table
-- already existed. The fix: ALTER the existing table to add the two
-- genuinely new columns the on-create research path needs.
--
-- The on-create writer and the /api/subscriptions/cancellation-info reader
-- have been re-aligned to the original `provider` unique key, so we DO NOT
-- introduce a separate provider_key column.

ALTER TABLE public.provider_cancellation_info
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS notice_period_days INTEGER;
