-- Track the most recent letter we sent to a supplier so the
-- dispute-reminders cron clocks the 14d/30d reminders from
-- THAT date, not from disputes.created_at. Without this a
-- back-and-forth dispute keeps tripping the original-creation
-- reminder window even when fresh letters are flying every week.
-- Paul flagged 2026-04-29 on the Enterprise Rent-a-Car case.

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS last_letter_sent_at TIMESTAMPTZ;

-- Backfill from the latest ai_letter on each dispute so existing
-- disputes don't lose their place in the queue.
UPDATE disputes d
SET last_letter_sent_at = (
  SELECT MAX(c.created_at)
  FROM correspondence c
  WHERE c.dispute_id = d.id
    AND c.entry_type = 'ai_letter'
)
WHERE d.last_letter_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_disputes_last_letter_sent_at
  ON disputes(last_letter_sent_at)
  WHERE last_letter_sent_at IS NOT NULL;

-- last_reminder_sent + reminder_count have been referenced by the
-- /api/cron/dispute-reminders cron forever but were never formally
-- migrated. The cron has been silently throwing — patches the gap so
-- the 14d/30d nudge actually fires now that the clock is letter-aware.
ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMPTZ;
ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
