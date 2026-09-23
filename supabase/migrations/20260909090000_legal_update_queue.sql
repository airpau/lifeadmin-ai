-- legal_update_queue — the review queue for detected UK legal / regulator changes.
--
-- The table was referenced by code but never created. Every write from
-- /api/cron/legal-updates (daily 06:00) and /api/cron/verify-legal-refs
-- (daily 05:00) went to a relation that does not exist. Supabase returns
-- the error in `{ error }` rather than throwing, and none of those insert
-- call-sites checked it, so each scan silently discarded every change it
-- detected while still reporting "N queued for review" to the founder.
--
-- Additive only — CREATE TABLE IF NOT EXISTS, no DROP, no ALTER ... DROP.

CREATE TABLE IF NOT EXISTS legal_update_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- NULL for change_type = 'new_legislation': the change is not yet
  -- attached to a stored citation. ON DELETE SET NULL keeps the audit
  -- row when a citation is removed.
  legal_reference_id UUID REFERENCES legal_references(id) ON DELETE SET NULL,

  change_type TEXT NOT NULL CHECK (
    change_type IN ('content_update', 'new_legislation', 'repealed', 'new_guidance', 'regulator_change')
  ),
  source_url TEXT,
  detected_change_summary TEXT NOT NULL,
  proposed_update TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'auto_applied')
  ),

  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- /api/cron/legal-coverage-alert and /api/complaints/generate both filter
-- on status = 'pending'; the admin page orders by created_at desc.
CREATE INDEX IF NOT EXISTS idx_legal_update_queue_status_created
  ON legal_update_queue (status, created_at DESC);

-- /api/complaints/generate does .in('legal_reference_id', refIds) on every
-- letter generation to flag citations with a pending change.
CREATE INDEX IF NOT EXISTS idx_legal_update_queue_reference
  ON legal_update_queue (legal_reference_id);

ALTER TABLE legal_update_queue ENABLE ROW LEVEL SECURITY;

-- Same posture as the sibling compliance tables (legal_ref_corrections,
-- legal_ref_candidates): no access for anon/authenticated. The service
-- role bypasses RLS, so the crons and the founder-gated admin routes
-- still read and write it.
DROP POLICY IF EXISTS "service-role only" ON legal_update_queue;
CREATE POLICY "service-role only" ON legal_update_queue
  FOR ALL USING (false);

COMMENT ON TABLE legal_update_queue IS
  'Founder review queue for legal/regulator changes detected by the legal-updates and verify-legal-refs crons. AI proposes, founder approves — see CLAUDE.md compliance citation principle.';
