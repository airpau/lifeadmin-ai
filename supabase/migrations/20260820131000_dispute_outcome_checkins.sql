-- Outcome check-in nudges (cron: /api/cron/outcome-checkin).
--
-- Users forget to mark disputes as won, so recovered totals and dispute
-- intelligence go stale. The cron chases disputes that have been open
-- 14+ days across whatever channels the user has connected, at most
-- every 14 days and at most 3 times per dispute. These two columns are
-- the dedup/cap state for that loop.
--
-- Strictly additive; no existing columns touched.

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS outcome_checkin_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outcome_checkin_last_at timestamptz;

COMMENT ON COLUMN public.disputes.outcome_checkin_count IS
  'How many outcome check-in nudges have been sent for this dispute (cron caps at 3).';
COMMENT ON COLUMN public.disputes.outcome_checkin_last_at IS
  'When the most recent outcome check-in nudge was sent (cron re-nudges after 14 days).';
