-- "How we won" snapshot on dispute outcome events.
--
-- Written by POST /api/disputes/[id]/outcome for terminal outcomes
-- (won / partial / lost / withdrawn / timeout). Captures the shape of
-- the campaign that produced the outcome so the intelligence flywheel
-- can answer "what does a winning dispute look like" without re-joining
-- correspondence and legal_ref_usages at query time.
--
-- Additive only: ADD COLUMN IF NOT EXISTS, never dropped. The route
-- guards the insert so it works both before and after this migration
-- is applied (it retries without how_won if the column is missing).

ALTER TABLE public.dispute_outcome_events
  ADD COLUMN IF NOT EXISTS how_won jsonb;

COMMENT ON COLUMN public.dispute_outcome_events.how_won IS
  'Snapshot of how the outcome was reached, written at outcome time. Shape: { letters_sent, correspondence_count, laws_cited: [{ ref_id, law_name, section }], laws_cited_count, escalation_path, resolution_time_days, provider, industry, recovered_gbp, disputed_gbp }. Any key may be null if its tolerant lookup failed.';
