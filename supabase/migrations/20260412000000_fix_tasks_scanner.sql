-- ============================================================
-- Fix tasks table for email scanner (2026-04-12)
--
-- Problems being fixed:
-- 1. tasks.type CHECK constraint never included 'opportunity' →
--    all gmail/outlook scanner INSERT calls fail with a constraint
--    violation, so scanner results are never persisted to the DB.
-- 2. tasks.status CHECK constraint didn't include 'suggested' →
--    low-confidence scanner findings (confidence < 70) also fail.
-- 3. getScannerResults in the Telegram bot selects a `source`
--    column that doesn't exist → every read of scanner results
--    errors with "column tasks.source does not exist", which
--    Claude surfaces as "technical issue with the email scanner".
-- ============================================================

-- 1. Expand the type constraint to include 'opportunity'
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check CHECK (type IN (
  'bill_dispute',
  'complaint_letter',
  'subscription_cancel',
  'refund_claim',
  'price_negotiation',
  'contract_review',
  'parking_appeal',
  'insurance_claim',
  'opportunity',
  'other'
));

-- 2. Expand the status constraint to include 'suggested'
--    (already contains 'approved' and 'dismissed' from the 20260327 migration)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN (
  'pending_review',
  'in_progress',
  'awaiting_response',
  'resolved_success',
  'resolved_partial',
  'resolved_failed',
  'escalated',
  'cancelled',
  'approved',
  'dismissed',
  'suggested'
));

-- 3. Add source column so the Telegram bot SELECT doesn't error
--    Values: 'gmail_scan', 'outlook_scan', 'imap_scan', 'manual', NULL
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source) WHERE source IS NOT NULL;
