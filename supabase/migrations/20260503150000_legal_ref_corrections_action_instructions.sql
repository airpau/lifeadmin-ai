-- Phase 3 of compliance UX overhaul: when the AI gives up on a stuck
-- compliance item (url_dead with no recoverable URL, ambiguous corrections,
-- non-authority candidates we can't resolve), it writes a one-line
-- founder instruction here instead of just logging "manual research needed"
-- to business_log where it gets buried.
--
-- The admin Compliance Centre surfaces this inline so the founder knows
-- exactly what to do — e.g. "Search legislation.gov.uk for 'Consumer
-- Rights Act 2015 s.9' and paste the new URL".

ALTER TABLE legal_ref_corrections
ADD COLUMN IF NOT EXISTS action_instructions TEXT;

COMMENT ON COLUMN legal_ref_corrections.action_instructions IS
  'AI-written one-line founder instruction for stuck items. NULL when '
  'the correction is a normal proposed change. Surfaced in the '
  'Compliance Centre review queue.';
