-- Extend b2b_waitlist to track checkout intent + abandonment so the
-- /for-business buy flow can capture leads BEFORE Stripe redirects
-- and the webhook can mark conversion / abandonment retrospectively.
--
-- (This migration was applied to remote on 2026-04-28 ahead of the
-- code that depends on it — committing the SQL afterwards keeps the
-- repo migration history canonical for fresh environments.)

ALTER TABLE b2b_waitlist DROP CONSTRAINT IF EXISTS b2b_waitlist_status_check;
ALTER TABLE b2b_waitlist ADD CONSTRAINT b2b_waitlist_status_check
  CHECK (status IN ('new', 'qualified', 'contacted', 'rejected', 'converted', 'checkout_started', 'checkout_abandoned'));

ALTER TABLE b2b_waitlist
  ADD COLUMN IF NOT EXISTS intended_tier TEXT,
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- Checkout-driven leads don't fill the use-case / volume fields, so
-- relax those NOT NULL constraints to accommodate both lead sources.
ALTER TABLE b2b_waitlist ALTER COLUMN expected_volume DROP NOT NULL;
ALTER TABLE b2b_waitlist ALTER COLUMN use_case DROP NOT NULL;
ALTER TABLE b2b_waitlist DROP CONSTRAINT IF EXISTS b2b_waitlist_use_case_check;
