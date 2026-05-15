-- ============================================================
-- Disputes: outcome audit fields
-- ============================================================
-- Adds the audit trail the Pocket Agent needs when a user declares
-- a dispute outcome ("we won", "they paid full amount", "they
-- rejected it") so we can record:
--   - WHO set the outcome (user via Pocket Agent, agent, system)
--   - WHEN it was set (separate from resolved_at so we can tell a
--     user-marked outcome apart from an auto-detected one)
--   - HOW CONFIDENT we are (user-confirmed vs inferred from reply)
--   - A canonical recovered_amount_gbp mirror, kept in step with the
--     legacy money_recovered field. The duplicate gives reporting
--     code a single column to SUM() against the won-disputes filter
--     without having to know about currency.
--   - A short outcome label ('won' / 'partial' / 'lost' / 'withdrawn')
--     to complement the longer status enum.
--
-- All adds are IF NOT EXISTS — additive only, never DROP/ALTER. The
-- legacy money_recovered column stays put.

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS outcome TEXT
  CHECK (outcome IS NULL OR outcome IN ('won', 'partial', 'lost', 'withdrawn'));
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS recovered_amount_gbp DECIMAL(10, 2);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS outcome_set_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS outcome_set_by TEXT
  CHECK (outcome_set_by IS NULL OR outcome_set_by IN ('user', 'agent', 'system', 'telegram', 'whatsapp'));
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS outcome_confidence TEXT
  CHECK (outcome_confidence IS NULL OR outcome_confidence IN ('confirmed', 'inferred', 'unverified'));

-- Index used by the running "money saved" counter:
--   SELECT SUM(recovered_amount_gbp) FROM disputes
--   WHERE user_id = $1 AND outcome = 'won';
CREATE INDEX IF NOT EXISTS idx_disputes_user_outcome
  ON disputes(user_id, outcome)
  WHERE outcome IS NOT NULL;
